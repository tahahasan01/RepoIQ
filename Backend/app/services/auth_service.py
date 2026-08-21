from typing import Optional, Dict, Any
from app.db.postgres import get_db, get_service_db
from app.core.security import create_access_token, create_refresh_token
from app.core.concurrency import run_blocking
from app.services.redis_service import get_redis_service
from app.core.logging import get_logger
from app.services.encryption_service import encrypt_token, redact_sensitive
from app.services import local_auth
import httpx
import asyncio

logger = get_logger(__name__)


def _is_network_error(exc: Exception) -> bool:
    error_msg = str(exc).lower()
    return (
        "getaddrinfo" in error_msg
        or "11001" in error_msg
        or "dns" in error_msg
        or "connection" in error_msg
        or "network" in error_msg
    )


async def _retry_db_operation(operation, max_retries=3, delay=1.0):
    """
    Retry a blocking database operation with exponential backoff, without
    blocking the event loop.

    PERF: this was a synchronous function called from async handlers. Both the
    supabase call and the `time.sleep()` between retries ran on the event loop,
    so a single flaky login could stall every other in-flight request on that
    worker for up to three seconds. The operation now runs in the threadpool and
    the backoff uses asyncio.sleep.
    """
    for attempt in range(max_retries):
        try:
            return await run_blocking(operation)
        except Exception as e:
            if _is_network_error(e) and attempt < max_retries - 1:
                wait_time = delay * (2 ** attempt)  # Exponential backoff
                logger.warning(
                    f"Database operation failed (attempt {attempt + 1}/{max_retries}): {e}. "
                    f"Retrying in {wait_time:.1f}s..."
                )
                await asyncio.sleep(wait_time)
                continue
            # Not a network error or last attempt - re-raise
            raise


def _safe_log_dict(data: dict, sensitive_keys: set = None) -> dict:
    """Create a copy of dict with sensitive values redacted for logging."""
    if sensitive_keys is None:
        sensitive_keys = {'access_token', 'refresh_token', 'token', 'password', 'secret', 'github_access_token'}
    
    safe_data = {}
    for key, value in data.items():
        if any(sk in key.lower() for sk in sensitive_keys):
            safe_data[key] = redact_sensitive(str(value)) if value else "[empty]"
        else:
            safe_data[key] = value
    return safe_data


def _issue_session(user_id: str, email: Optional[str] = None) -> Dict[str, str]:
    """
    Mint a token pair and register it as this user's live session.

    Every login path must go through here. Clearing the revocation watermark
    matters: without it, a user who logs out and straight back in would present a
    fresh token that still predates the watermark's whole-second resolution and be
    rejected. Registering the refresh jti is what makes replay of a superseded
    refresh token detectable.
    """
    from app.core.security import verify_token
    from app.services.session_revocation import clear_revocation, register_refresh_token

    clear_revocation(user_id)

    claims = {"sub": user_id}
    if email:
        claims["email"] = email

    access_token = create_access_token(claims)
    refresh_token = create_refresh_token({"sub": user_id})

    refresh_payload = verify_token(refresh_token, "refresh") or {}
    register_refresh_token(user_id, refresh_payload.get("jti"))

    return {"access_token": access_token, "refresh_token": refresh_token}


class AuthService:
    def __init__(self):
        self.db = get_db()
        self.service_db = get_service_db()
        self.redis = get_redis_service()

    @staticmethod
    def invalidate_user_cache(user_id: str) -> None:
        """Drop the cached user record so the next read is authoritative."""
        if user_id:
            get_redis_service().delete(f"db:user:{user_id}")
    
    async def signup(self, email: str, password: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Create an account with a locally-hashed password.

        Supabase Auth used to own credentials; they now live in
        users.password_hash. app/services/local_auth.py holds no session state,
        which removes the class of bug behind AUDIT.md C-1 entirely rather than
        guarding against it.
        """
        try:
            user = await local_auth.register(self.db, email, password, full_name)
            session = _issue_session(user["id"], email)

            return {
                "user": {
                    "id": user["id"],
                    "email": email,
                    "full_name": full_name,
                },
                "access_token": session["access_token"],
                "refresh_token": session["refresh_token"],
            }
        except local_auth.AuthError:
            raise
        except Exception as e:
            logger.error(f"Signup failed: {type(e).__name__}: {e}")
            raise

    async def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Verify credentials locally and issue a session.

        Unknown email and wrong password are indistinguishable to the caller, and
        both cost the same time - see local_auth.verify_password.
        """
        user = await local_auth.authenticate(self.db, email, password)
        session = _issue_session(user["id"], email)

        return {
            "user": user,
            "access_token": session["access_token"],
            "refresh_token": session["refresh_token"],
        }

    async def github_oauth(self, code: str) -> Dict[str, Any]:
        from app.core.config import get_settings
        import asyncio
        import uuid
        settings = get_settings()
        
        try:
            start_time = asyncio.get_event_loop().time()

            # PERF: two socket.gethostbyname() pre-flight checks used to run here,
            # one for github.com and one for the Supabase host. socket.gethostbyname
            # is a blocking C call - inside an async handler it stalls the entire
            # worker's event loop for the duration of the lookup, on every login.
            # They were also redundant: httpx and supabase-py both surface DNS
            # failures themselves, and the handlers below already translate those
            # into the same guidance. Removed rather than moved to a thread -
            # a diagnostic that costs every user latency is not worth keeping.

            # Use longer timeout for GitHub API
            # Configure httpx with better error handling for Windows DNS issues
            timeout = httpx.Timeout(30.0, connect=10.0)
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Step 1: Exchange code for token (required first - ~1-2s)
                logger.info("GitHub OAuth: Exchanging code for token...")
                try:
                    token_response = await client.post(
                        "https://github.com/login/oauth/access_token",
                        data={
                            "client_id": settings.GITHUB_CLIENT_ID,
                            "client_secret": settings.GITHUB_CLIENT_SECRET,
                            "code": code,
                            "redirect_uri": settings.GITHUB_REDIRECT_URI
                        },
                        headers={"Accept": "application/json"}
                    )
                except (httpx.ConnectError, httpx.ConnectTimeout, OSError) as conn_error:
                    # More specific error handling for network/DNS issues
                    error_msg = str(conn_error)
                    error_code = getattr(conn_error, 'errno', None)
                    
                    if "getaddrinfo" in error_msg.lower() or error_code == 11001 or "11001" in error_msg:
                        logger.error("DNS resolution failed - cannot resolve github.com")
                        logger.error("Troubleshooting steps:")
                        logger.error("1. Check internet connection: ping github.com")
                        logger.error("2. Flush DNS cache: ipconfig /flushdns (run as admin)")
                        logger.error("3. Check firewall/antivirus blocking Python")
                        logger.error("4. Try restarting the backend server")
                        logger.error("5. Check if using VPN/proxy - may need to configure")
                        raise Exception(
                            "Network error: Cannot resolve GitHub's domain name. "
                            "This is a DNS/network issue, not a credentials problem. "
                            "Please check your internet connection and DNS settings. "
                            "Run 'ipconfig /flushdns' in admin PowerShell and restart the backend."
                        )
                    raise
                
                token_data = token_response.json()
                logger.info(f"GitHub token response status: {token_response.status_code}")
                logger.debug(f"GitHub token response: {_safe_log_dict(token_data)}")
                
                # Check for GitHub API errors first
                if "error" in token_data:
                    error_code = token_data.get("error", "")
                    error_description = token_data.get("error_description", "")
                    
                    # Handle common GitHub OAuth errors
                    if error_code == "bad_verification_code":
                        logger.warning("GitHub OAuth: Authorization code expired or already used")
                        raise Exception(
                            "GitHub authorization code expired or already used. "
                            "Please start a new GitHub login - authorization codes expire quickly and can only be used once."
                        )
                    elif error_code == "incorrect_client_credentials":
                        logger.error("GitHub OAuth: Invalid client credentials")
                        raise Exception(
                            "GitHub OAuth configuration error. Please check GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env file."
                        )
                    elif error_code == "redirect_uri_mismatch":
                        logger.error(f"GitHub OAuth: Redirect URI mismatch. Expected: {settings.GITHUB_REDIRECT_URI}")
                        raise Exception(
                            f"GitHub redirect URI mismatch. Please ensure your GitHub OAuth app's callback URL matches: {settings.GITHUB_REDIRECT_URI}"
                        )
                    else:
                        logger.error(f"GitHub OAuth error: {error_code} - {error_description}")
                        raise Exception(
                            f"GitHub authentication failed: {error_description or error_code}. "
                            "Please try logging in again with GitHub."
                        )
                
                access_token = token_data.get("access_token")

                if not access_token:
                    error_msg = token_data.get("error_description", token_data.get("error", "Unknown error"))
                    raise Exception(f"Failed to get GitHub access token: {error_msg}")
                
                token_time = asyncio.get_event_loop().time()
                logger.info(f"GitHub OAuth: Token exchange took {(token_time - start_time)*1000:.0f}ms")
                
                # Step 2: PARALLEL - Fetch user info, emails, AND encrypt token simultaneously
                # Encryption is CPU-bound, so run in thread pool
                logger.info("GitHub OAuth: Fetching user info + encrypting token (parallel)...")
                auth_headers = {"Authorization": f"Bearer {access_token}"}
                
                # Create tasks for parallel execution
                user_task = client.get("https://api.github.com/user", headers=auth_headers)
                emails_task = client.get("https://api.github.com/user/emails", headers=auth_headers)
                
                # Run encryption in thread pool (CPU-bound operation)
                loop = asyncio.get_event_loop()
                encrypt_task = loop.run_in_executor(None, encrypt_token, access_token)
                
                # Execute all three in parallel
                user_response, email_response, encrypted_token = await asyncio.gather(
                    user_task, emails_task, encrypt_task
                )
                
                github_user = user_response.json()
                emails = email_response.json()
                github_username = github_user.get("login")
                
                parallel_time = asyncio.get_event_loop().time()
                logger.info(f"GitHub OAuth: Parallel fetch took {(parallel_time - token_time)*1000:.0f}ms")
                
                # Get email - prefer from user response, fallback to emails list.
                #
                # SECURITY: only a VERIFIED address may be used. The email is an
                # account-matching key below (an existing user with the same
                # address gets this GitHub identity linked to it and is issued
                # tokens), so accepting an unverified address would let anyone who
                # sets a victim's email on a throwaway GitHub account take over
                # that victim's RepoIQ account.
                email = github_user.get("email")
                if not email and isinstance(emails, list):
                    primary_email = next(
                        (e for e in emails if e.get("primary") and e.get("verified")),
                        None
                    )
                    if primary_email is None:
                        primary_email = next(
                            (e for e in emails if e.get("verified")),
                            None
                        )
                    # The synthetic fallback is not a real address and must never
                    # match an existing account; it only ever creates a new one.
                    email = primary_email["email"] if primary_email else f"{github_username}@users.noreply.github.com"
                
                # Step 3: Database lookup - try by github_username first (faster, indexed)
                # Then fallback to email if not found
                logger.info(f"GitHub OAuth: Looking up user...")
                user = None
                
                try:
                    # Try github_username first (returning users) - with retry for network issues
                    if github_username:
                        username_query = await _retry_db_operation(
                            lambda: self.service_db.table("users").select("*").eq("github_username", github_username).execute()
                        )
                        if username_query.data:
                            user = username_query.data[0]
                            logger.info(f"GitHub OAuth: Found user by github_username")
                    
                    # Fallback to email lookup - with retry for network issues
                    if not user:
                        email_query = await _retry_db_operation(
                            lambda: self.service_db.table("users").select("*").eq("email", email).execute()
                        )
                        if email_query.data:
                            user = email_query.data[0]
                            logger.info(f"GitHub OAuth: Found user by email")
                except Exception as db_error:
                    error_msg = str(db_error)
                    # Check if it's a network/DNS error
                    if "getaddrinfo" in error_msg.lower() or "11001" in error_msg or "dns" in error_msg.lower():
                        logger.error(f"Database connection failed (DNS/network issue): {db_error}")
                        logger.error("This might be a Supabase connection issue. Check:")
                        logger.error("1. Internet connection")
                        logger.error("2. SUPABASE_URL in .env file")
                        logger.error("3. Firewall/antivirus blocking connections")
                        raise Exception(
                            "Database connection failed. Please check your internet connection "
                            "and Supabase configuration. Error: Network/DNS resolution issue."
                        )
                    # Re-raise other database errors
                    raise
                
                db_lookup_time = asyncio.get_event_loop().time()
                logger.info(f"GitHub OAuth: DB lookup took {(db_lookup_time - parallel_time)*1000:.0f}ms")
                
                if user:
                    # Update existing user (non-blocking fire-and-forget for speed)
                    logger.info(f"GitHub OAuth: Updating existing user: {redact_sensitive(user['id'])}")
                    
                    try:
                        await _retry_db_operation(
                            lambda: self.service_db.table("users").update({
                                "github_username": github_username,
                                "github_access_token": encrypted_token,
                                "github_connected": True,
                                "avatar_url": github_user.get("avatar_url"),
                                "full_name": github_user.get("name") or user.get("full_name")
                            }).eq("id", user["id"]).execute()
                        )
                    except Exception as update_error:
                        error_msg = str(update_error)
                        if "getaddrinfo" in error_msg.lower() or "11001" in error_msg:
                            logger.error(f"Database update failed (DNS/network issue): {update_error}")
                            raise Exception(
                                "Failed to update user in database. Network/DNS issue. "
                                "Please check your internet connection and try again."
                            )
                        raise
                    
                    # The cached record still has the old token / connection
                    # state; a fresh GitHub link must take effect immediately.
                    self.invalidate_user_cache(user["id"])

                    # Update user dict with latest data
                    user["github_username"] = github_username
                    user["avatar_url"] = github_user.get("avatar_url")
                    user["full_name"] = github_user.get("name") or user.get("full_name")
                else:
                    # Create new user
                    user_id = str(uuid.uuid4())
                    logger.info(f"GitHub OAuth: Creating new user: {redact_sensitive(user_id)}")
                    
                    user = {
                        "id": user_id,
                        "email": email,
                        "full_name": github_user.get("name"),
                        "bio": github_user.get("bio"),
                        "avatar_url": github_user.get("avatar_url"),
                        "github_username": github_username,
                        "github_access_token": encrypted_token,
                        "github_connected": True
                    }
                    
                    try:
                        await _retry_db_operation(
                            lambda: self.service_db.table("users").insert(user).execute()
                        )
                    except Exception as insert_error:
                        error_msg = str(insert_error)
                        if "getaddrinfo" in error_msg.lower() or "11001" in error_msg:
                            logger.error(f"Database insert failed (DNS/network issue): {insert_error}")
                            raise Exception(
                                "Failed to create user in database. Network/DNS issue. "
                                "Please check your internet connection and try again."
                            )
                        raise
                
                # Generate app tokens (fast - JWT creation)
                gh_session = _issue_session(user["id"], email)
                app_access_token = gh_session["access_token"]
                app_refresh_token = gh_session["refresh_token"]
                
                total_time = asyncio.get_event_loop().time()
                logger.info(f"GitHub OAuth: ✅ Complete for user: {redact_sensitive(user['id'])} in {(total_time - start_time)*1000:.0f}ms")
                
                return {
                    "user": user,
                    "access_token": app_access_token,
                    "refresh_token": app_refresh_token,
                    "github_access_token": access_token
                }
        except Exception as e:
            logger.error(f"GitHub OAuth failed: {str(e)}")
            raise
    
    async def github_app_login(
        self, code: str, installation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Complete a GitHub App sign-in.

        The counterpart to github_oauth() for GITHUB_AUTH_MODE=app. The important
        difference is what is NOT stored: no long-lived `repo`-scoped token ever
        touches the database. All that persists is which installation belongs to
        this user; repository access is a one-hour token minted on demand from
        the app's private key.

        The user token obtained here is used only to establish identity, and is
        discarded when this function returns.
        """
        import uuid
        from app.services import github_app

        # 1. Identity. Uses the GitHub App's own client credentials, which are
        #    distinct from the OAuth App's.
        token_data = await github_app.exchange_user_code(code)
        user_token = token_data.get("access_token")
        if not user_token:
            raise Exception("GitHub did not return a user token")

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            headers = {"Authorization": f"Bearer {user_token}",
                       "Accept": "application/vnd.github+json"}
            user_response, email_response = await asyncio.gather(
                client.get("https://api.github.com/user", headers=headers),
                client.get("https://api.github.com/user/emails", headers=headers),
            )

        github_user = user_response.json()
        github_username = github_user.get("login")
        if not github_username:
            raise Exception("Could not read the GitHub profile")

        # SECURITY: only a verified address may match an existing account - see
        # the same reasoning in github_oauth().
        emails = email_response.json()
        email = github_user.get("email")
        if not email and isinstance(emails, list):
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            primary = primary or next((e for e in emails if e.get("verified")), None)
            email = primary["email"] if primary else f"{github_username}@users.noreply.github.com"

        # 2. Which installation is this user's. GitHub passes installation_id on
        #    the callback after a fresh install; on a returning login it does
        #    not, so fall back to asking.
        if not installation_id:
            installation_id = await github_app.get_user_installation_id(user_token)

        if not installation_id:
            # Authorised but not installed. This is a normal state, not an
            # error: the user gets sent to the install page rather than shown a
            # failure. Raised as a typed exception so the route can answer with
            # the install URL instead of a generic 400.
            from app.services.github_app import GitHubAppNotInstalled

            raise GitHubAppNotInstalled(
                "The GitHub App is not installed for this account."
            )

        # 3. Upsert. Note github_access_token is deliberately absent.
        existing = await _retry_db_operation(
            lambda: self.service_db.table("users").select("*")
            .eq("github_username", github_username).execute()
        )
        record = existing.data[0] if existing.data else None

        if not record:
            by_email = await _retry_db_operation(
                lambda: self.service_db.table("users").select("*").eq("email", email).execute()
            )
            record = by_email.data[0] if by_email.data else None

        payload = {
            "github_username": github_username,
            "github_installation_id": str(installation_id),
            "github_connected": True,
            "avatar_url": github_user.get("avatar_url"),
            "full_name": github_user.get("name") or (record or {}).get("full_name"),
        }

        if record:
            await _retry_db_operation(
                lambda: self.service_db.table("users").update(payload)
                .eq("id", record["id"]).execute()
            )
            self.invalidate_user_cache(record["id"])
            user = {**record, **payload}
        else:
            user = {"id": str(uuid.uuid4()), "email": email, "bio": github_user.get("bio"), **payload}
            await _retry_db_operation(
                lambda: self.service_db.table("users").insert(user).execute()
            )

        session = _issue_session(user["id"], email)
        logger.info(f"GitHub App login complete for {redact_sensitive(user['id'])}")

        return {
            "user": user,
            "access_token": session["access_token"],
            "refresh_token": session["refresh_token"],
        }

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a user record.

        SCALE: this runs on EVERY authenticated request via get_current_user, so
        it was the single highest-frequency query in the system - one Supabase
        round trip per API call, per user, forever. A short-TTL cache removes it
        from the hot path entirely.

        The TTL is deliberately short (60s): the record carries github_connected
        and the encrypted token, so a disconnect or re-auth must take effect
        quickly. Mutating paths call invalidate_user_cache() to make it immediate.
        """
        cache_key = f"db:user:{user_id}"
        cached = self.redis.get(cache_key)
        if cached is not None:
            return cached

        try:
            result = await run_blocking(
                lambda: self.service_db.table("users").select("*").eq("id", user_id).single().execute()
            )
            if result.data:
                self.redis.set(cache_key, result.data, ttl=60)
            return result.data
        except Exception as e:
            logger.error(f"Get user failed: {str(e)}")
            return None
    
    async def update_user(self, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = await run_blocking(
                lambda: self.service_db.table("users").update(data).eq("id", user_id).execute()
            )
            # The cached copy is now stale; a disconnect or profile edit must be
            # visible immediately, not after the TTL.
            self.invalidate_user_cache(user_id)
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Update user failed: {str(e)}")
            raise
    
    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """
        Change a password.

        Addressed to user_id explicitly. See AUDIT.md C-1: the Supabase version
        ignored current_password and applied the change to whichever session the
        shared client happened to hold, so it could change the wrong account's
        password. Local auth has no session state for that to go wrong with.
        """
        try:
            changed = await local_auth.change_password(
                self.db, user_id, current_password, new_password
            )
            if changed:
                self.invalidate_user_cache(user_id)
            return changed
        except Exception as e:
            logger.error(f"Password change failed: {type(e).__name__}")
            return False

    async def delete_user(self, user_id: str) -> bool:
        try:
            await run_blocking(
                lambda: self.service_db.table("users").delete().eq("id", user_id).execute()
            )
            self.invalidate_user_cache(user_id)
            return True
        except Exception as e:
            logger.error(f"Delete user failed: {str(e)}")
            return False
    
    async def upload_avatar(
        self, user_id: str, file_data: bytes, filename: str, content_type: str = None
    ) -> str:
        """
        Store an avatar and record its URL.

        Supabase Storage is gone; app/services/local_storage.py writes to disk.
        The stored filename is generated rather than taken from the upload -
        the old path was f"avatars/{user_id}/{filename}", which interpolated a
        client-supplied filename straight into a storage path.
        """
        from app.services import local_storage

        try:
            previous = (await self.get_user(user_id) or {}).get("avatar_url")

            public_url = await run_blocking(
                local_storage.store_avatar, user_id, file_data, filename, content_type
            )

            await self.update_user(user_id, {"avatar_url": public_url})

            # Only after the new one is safely recorded, so a failure mid-way
            # cannot leave the user with no avatar at all.
            await run_blocking(local_storage.delete_avatar, previous)

            return public_url
        except local_storage.StorageError:
            raise
        except Exception as e:
            logger.error(f"Avatar upload failed: {type(e).__name__}: {e}")
            raise
