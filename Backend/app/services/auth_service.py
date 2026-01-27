from typing import Optional, Dict, Any
from datetime import datetime
from app.db.supabase import get_db, get_service_db
from app.core.security import create_access_token, create_refresh_token, verify_password, get_password_hash
from app.core.logging import get_logger
from app.services.encryption_service import encrypt_token, decrypt_token, redact_sensitive
from supabase import Client
import httpx

logger = get_logger(__name__)


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


class AuthService:
    def __init__(self):
        self.db: Client = get_db()
        self.service_db: Client = get_service_db()
    
    async def signup(self, email: str, password: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        try:
            auth_response = self.db.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if not auth_response.user:
                raise Exception("Failed to create user")
            
            user_data = {
                "id": auth_response.user.id,
                "email": email,
                "full_name": full_name,
                "created_at": datetime.utcnow().isoformat()
            }
            
            self.service_db.table("users").insert(user_data).execute()
            
            access_token = create_access_token({"sub": auth_response.user.id, "email": email})
            refresh_token = create_refresh_token({"sub": auth_response.user.id})
            
            return {
                "user": {
                    "id": auth_response.user.id,
                    "email": email,
                    "full_name": full_name
                },
                "access_token": access_token,
                "refresh_token": refresh_token
            }
        except Exception as e:
            logger.error(f"Signup failed: {str(e)}")
            raise
    
    async def login(self, email: str, password: str) -> Dict[str, Any]:
        try:
            auth_response = self.db.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if not auth_response.user:
                raise Exception("Invalid credentials")
            
            user_data = self.service_db.table("users").select("*").eq("id", auth_response.user.id).single().execute()
            
            access_token = create_access_token({"sub": auth_response.user.id, "email": email})
            refresh_token = create_refresh_token({"sub": auth_response.user.id})
            
            return {
                "user": user_data.data,
                "access_token": access_token,
                "refresh_token": refresh_token
            }
        except Exception as e:
            logger.error(f"Login failed: {str(e)}")
            raise
    
    async def github_oauth(self, code: str) -> Dict[str, Any]:
        from app.core.config import get_settings
        import asyncio
        settings = get_settings()
        
        try:
            # Use longer timeout for GitHub API
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Step 1: Exchange code for token (required first)
                logger.info("GitHub OAuth: Exchanging code for token...")
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
                
                token_data = token_response.json()
                logger.info(f"GitHub token response status: {token_response.status_code}")
                # SECURITY: Never log raw token data - use redacted version
                logger.debug(f"GitHub token response: {_safe_log_dict(token_data)}")
                access_token = token_data.get("access_token")

                if not access_token:
                    # SECURITY: Don't expose full token_data in error
                    error_msg = token_data.get("error_description", token_data.get("error", "Unknown error"))
                    raise Exception(f"Failed to get GitHub access token: {error_msg}")
                
                # Step 2: Fetch user info and emails IN PARALLEL for speed
                logger.info("GitHub OAuth: Fetching user info (parallel)...")
                auth_headers = {"Authorization": f"Bearer {access_token}"}
                
                user_task = client.get("https://api.github.com/user", headers=auth_headers)
                emails_task = client.get("https://api.github.com/user/emails", headers=auth_headers)
                
                user_response, email_response = await asyncio.gather(user_task, emails_task)
                
                github_user = user_response.json()
                emails = email_response.json()
                
                # Get email - prefer from user response, fallback to emails list
                email = github_user.get("email")
                if not email and isinstance(emails, list):
                    primary_email = next((e for e in emails if e.get("primary")), None)
                    email = primary_email["email"] if primary_email else f"{github_user['login']}@github.com"
                
                # Step 3: Database operations
                logger.info(f"GitHub OAuth: Looking up user by email: {redact_sensitive(email)}")
                user_query = self.service_db.table("users").select("*").eq("email", email).execute()
                
                # SECURITY: Encrypt GitHub token before storing (do this once)
                encrypted_token = encrypt_token(access_token)
                
                if user_query.data:
                    user = user_query.data[0]
                    logger.info(f"GitHub OAuth: Updating existing user: {redact_sensitive(user['id'])}")
                    
                    self.service_db.table("users").update({
                        "github_username": github_user.get("login"),
                        "github_access_token": encrypted_token,
                        "github_connected": True,
                        "avatar_url": github_user.get("avatar_url"),
                        "full_name": github_user.get("name") or user.get("full_name")
                    }).eq("id", user["id"]).execute()
                    
                    # Update user dict with latest data
                    user["github_username"] = github_user.get("login")
                    user["avatar_url"] = github_user.get("avatar_url")
                    user["full_name"] = github_user.get("name") or user.get("full_name")
                else:
                    # Create user directly without Supabase auth signup (faster)
                    import uuid
                    user_id = str(uuid.uuid4())
                    logger.info(f"GitHub OAuth: Creating new user: {redact_sensitive(user_id)}")
                    
                    user_data = {
                        "id": user_id,
                        "email": email,
                        "full_name": github_user.get("name"),
                        "bio": github_user.get("bio"),
                        "avatar_url": github_user.get("avatar_url"),
                        "github_username": github_user.get("login"),
                        "github_access_token": encrypted_token,
                        "github_connected": True
                    }
                    
                    self.service_db.table("users").insert(user_data).execute()
                    user = user_data
                
                # Generate app tokens
                app_access_token = create_access_token({"sub": user["id"], "email": email})
                app_refresh_token = create_refresh_token({"sub": user["id"]})
                
                logger.info(f"GitHub OAuth: ✅ Complete for user: {redact_sensitive(user['id'])}")
                
                return {
                    "user": user,
                    "access_token": app_access_token,
                    "refresh_token": app_refresh_token,
                    "github_access_token": access_token
                }
        except Exception as e:
            logger.error(f"GitHub OAuth failed: {str(e)}")
            raise
    
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = self.service_db.table("users").select("*").eq("id", user_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Get user failed: {str(e)}")
            return None
    
    async def update_user(self, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = self.service_db.table("users").update(data).eq("id", user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Update user failed: {str(e)}")
            raise
    
    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        try:
            user = await self.get_user(user_id)
            if not user:
                return False
            
            self.db.auth.update_user({
                "password": new_password
            })
            
            return True
        except Exception as e:
            logger.error(f"Password change failed: {str(e)}")
            return False
    
    async def delete_user(self, user_id: str) -> bool:
        try:
            self.service_db.table("users").delete().eq("id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Delete user failed: {str(e)}")
            return False
    
    async def upload_avatar(self, user_id: str, file_data: bytes, filename: str) -> str:
        try:
            file_path = f"avatars/{user_id}/{filename}"
            
            self.service_db.storage.from_("avatars").upload(file_path, file_data)
            
            public_url = self.service_db.storage.from_("avatars").get_public_url(file_path)
            
            await self.update_user(user_id, {"avatar_url": public_url})
            
            return public_url
        except Exception as e:
            logger.error(f"Avatar upload failed: {str(e)}")
            raise
