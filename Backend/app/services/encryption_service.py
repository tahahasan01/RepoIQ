"""
Encryption service for securing sensitive data like GitHub tokens.
Uses AES-256-GCM for authenticated encryption.

SECURITY: Tokens are encrypted at the application level before database storage.
"""
import os
import base64
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class EncryptionService:
    """
    Handles encryption/decryption of sensitive data using AES-256-GCM.
    
    Uses the application's SECRET_KEY to derive an encryption key.
    Each encryption generates a unique nonce for security.
    """
    
    def __init__(self):
        """
        Initialise the AES-256-GCM key.

        Key material comes from TOKEN_ENCRYPTION_KEY when set, otherwise from
        SECRET_KEY. Keeping them separate matters operationally: SECRET_KEY signs
        JWTs and should be rotatable at will, but it was also the sole input to
        this KDF - so rotating it made every GitHub token in the database
        permanently undecryptable, silently disconnecting every user.

        Decryption tries the primary key first and then any legacy key, so a
        deployment can move from SECRET_KEY-derived to TOKEN_ENCRYPTION_KEY-derived
        material without a migration or a re-auth stampede.
        """
        dedicated = getattr(settings, "TOKEN_ENCRYPTION_KEY", None)
        # Guard the type explicitly: a non-string here (a misconfigured value, or
        # a patched settings object in tests) otherwise fails deep inside the KDF
        # with "Cannot convert instance to a buffer", which tells nobody anything.
        if not isinstance(dedicated, str) or not dedicated.strip():
            dedicated = None

        primary_material = dedicated or settings.SECRET_KEY
        self._aesgcm = AESGCM(self._derive(primary_material))
        self._using_dedicated_key = dedicated is not None

        # Fallback for values written before TOKEN_ENCRYPTION_KEY was configured.
        self._legacy_aesgcm = None
        if self._using_dedicated_key and isinstance(settings.SECRET_KEY, str):
            self._legacy_aesgcm = AESGCM(self._derive(settings.SECRET_KEY))
        elif not self._using_dedicated_key:
            logger.warning(
                "TOKEN_ENCRYPTION_KEY is not set - GitHub tokens are encrypted with "
                "a key derived from SECRET_KEY. Rotating SECRET_KEY will make every "
                "stored token undecryptable."
            )

    @staticmethod
    def _derive(material: str) -> bytes:
        """
        Derive a 256-bit key.

        PBKDF2 with a fixed salt is not the right primitive for high-entropy input
        (HKDF is), and 10k iterations is far below current guidance for
        password-derived keys. It is retained here because changing it would
        invalidate every stored ciphertext; the security of this key rests on the
        entropy of the input, not on the iteration count. Revisit alongside a
        re-encryption migration.
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 256 bits
            salt=b"repoiq_token_encryption_salt_v1",  # Fixed salt (key is already random)
            iterations=10000,
        )
        return kdf.derive(material.encode('utf-8'))
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a string value.
        
        Args:
            plaintext: The string to encrypt
            
        Returns:
            Base64-encoded encrypted value (nonce + ciphertext + tag)
        """
        if not plaintext:
            return ""
        
        try:
            # Generate random 12-byte nonce (required for GCM)
            nonce = os.urandom(12)
            
            # Encrypt with authentication
            ciphertext = self._aesgcm.encrypt(
                nonce,
                plaintext.encode('utf-8'),
                None  # No additional authenticated data
            )
            
            # Combine nonce + ciphertext for storage
            encrypted_data = nonce + ciphertext
            
            # Return base64-encoded for safe storage
            return base64.b64encode(encrypted_data).decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {type(e).__name__}")
            raise ValueError("Failed to encrypt data")
    
    def decrypt(self, encrypted_value: str) -> str:
        """
        Decrypt an encrypted string value.
        
        Args:
            encrypted_value: Base64-encoded encrypted value
            
        Returns:
            Decrypted plaintext string
        """
        if not encrypted_value:
            return ""
        
        try:
            # Decode from base64
            encrypted_data = base64.b64decode(encrypted_value)

            # Extract nonce (first 12 bytes) and ciphertext
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]
        except Exception as e:
            logger.error(f"Decryption failed while decoding: {type(e).__name__}")
            raise ValueError("Failed to decrypt data - data may be corrupted or key mismatch")

        # Primary key first, then the legacy SECRET_KEY-derived key for values
        # written before TOKEN_ENCRYPTION_KEY was introduced. GCM authenticates,
        # so a wrong key raises rather than returning garbage - trying both is safe.
        for aesgcm in (self._aesgcm, self._legacy_aesgcm):
            if aesgcm is None:
                continue
            try:
                return aesgcm.decrypt(nonce, ciphertext, None).decode('utf-8')
            except Exception:
                continue

        logger.error("Decryption failed under all configured keys")
        raise ValueError("Failed to decrypt data - data may be corrupted or key mismatch")
    
    def is_encrypted(self, value: str) -> bool:
        """
        Check if a value appears to be encrypted (base64 encoded with proper structure).
        
        Note: This is a heuristic check, not cryptographic verification.
        """
        if not value:
            return False
        
        try:
            decoded = base64.b64decode(value)
            # Encrypted data should be at least 12 (nonce) + 16 (min ciphertext with tag)
            return len(decoded) >= 28
        except:
            return False


# Global singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get or create the global encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


def encrypt_token(token: str) -> str:
    """Convenience function to encrypt a token."""
    return get_encryption_service().encrypt(token)


def decrypt_token(encrypted_token: str) -> str:
    """Convenience function to decrypt a token."""
    return get_encryption_service().decrypt(encrypted_token)


def redact_sensitive(value: str, visible_chars: int = 4) -> str:
    """
    Redact sensitive data for logging, keeping only last few characters visible.
    
    Args:
        value: The sensitive string to redact
        visible_chars: Number of characters to keep visible at the end
        
    Returns:
        Redacted string like "****abcd"
    """
    if not value:
        return "[empty]"
    
    if len(value) <= visible_chars:
        return "*" * len(value)
    
    return "*" * (len(value) - visible_chars) + value[-visible_chars:]
