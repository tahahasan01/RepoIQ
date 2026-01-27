"""
Comprehensive tests for backend services.
Target: 70% coverage of core services.
"""
import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
import asyncio
from datetime import datetime

# Import services to test
from app.services.encryption_service import (
    EncryptionService, 
    encrypt_token, 
    decrypt_token, 
    redact_sensitive
)


class TestEncryptionService:
    """Tests for encryption service."""
    
    def test_encrypt_decrypt_roundtrip(self):
        """Test that encryption and decryption work correctly."""
        with patch('app.services.encryption_service.settings') as mock_settings:
            mock_settings.SECRET_KEY = "test_secret_key_for_testing_12345"
            service = EncryptionService()
            
            original = "ghp_testtoken123456789"
            encrypted = service.encrypt(original)
            decrypted = service.decrypt(encrypted)
            
            assert decrypted == original
            assert encrypted != original  # Should be different
    
    def test_encrypt_empty_string(self):
        """Test encryption of empty string."""
        with patch('app.services.encryption_service.settings') as mock_settings:
            mock_settings.SECRET_KEY = "test_secret_key_for_testing_12345"
            service = EncryptionService()
            
            result = service.encrypt("")
            assert result == ""
    
    def test_decrypt_empty_string(self):
        """Test decryption of empty string."""
        with patch('app.services.encryption_service.settings') as mock_settings:
            mock_settings.SECRET_KEY = "test_secret_key_for_testing_12345"
            service = EncryptionService()
            
            result = service.decrypt("")
            assert result == ""
    
    def test_is_encrypted(self):
        """Test is_encrypted detection."""
        with patch('app.services.encryption_service.settings') as mock_settings:
            mock_settings.SECRET_KEY = "test_secret_key_for_testing_12345"
            service = EncryptionService()
            
            encrypted = service.encrypt("test_token")
            
            assert service.is_encrypted(encrypted) == True
            assert service.is_encrypted("plain_text") == False
            assert service.is_encrypted("") == False


class TestRedactSensitive:
    """Tests for sensitive data redaction."""
    
    def test_redact_token(self):
        """Test token redaction."""
        result = redact_sensitive("ghp_abc123def456ghi789")
        assert result.endswith("i789")
        assert result.startswith("*")
        assert "ghp_" not in result
    
    def test_redact_empty(self):
        """Test redacting empty string."""
        result = redact_sensitive("")
        assert result == "[empty]"
    
    def test_redact_short_string(self):
        """Test redacting very short string."""
        result = redact_sensitive("abc")
        assert result == "***"
    
    def test_redact_custom_visible_chars(self):
        """Test custom visible characters."""
        result = redact_sensitive("my_secret_token", visible_chars=6)
        assert result.endswith("_token")


class TestRepositoryService:
    """Tests for repository service."""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database client."""
        return MagicMock()
    
    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis service."""
        mock = MagicMock()
        mock.get.return_value = None  # No cache by default
        return mock
    
    @pytest.mark.asyncio
    async def test_resolve_repository_id_with_uuid(self, mock_db, mock_redis):
        """Test resolving repository ID with UUID."""
        from app.services.repository_service import RepositoryService
        
        with patch('app.services.repository_service.get_service_db', return_value=mock_db), \
             patch('app.services.repository_service.get_redis_service', return_value=mock_redis):
            
            service = RepositoryService()
            service.db = mock_db
            
            # Mock database response
            mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": "123e4567-e89b-12d3-a456-426614174000"
            }
            
            result = await service.resolve_repository_id(
                "123e4567-e89b-12d3-a456-426614174000",
                "user_123"
            )
            
            assert result == "123e4567-e89b-12d3-a456-426614174000"
    
    @pytest.mark.asyncio
    async def test_resolve_repository_id_with_github_id(self, mock_db, mock_redis):
        """Test resolving repository ID with GitHub numeric ID."""
        from app.services.repository_service import RepositoryService
        
        with patch('app.services.repository_service.get_service_db', return_value=mock_db), \
             patch('app.services.repository_service.get_redis_service', return_value=mock_redis):
            
            service = RepositoryService()
            service.db = mock_db
            
            # First query (UUID check) returns None
            mock_result = MagicMock()
            mock_result.data = {"id": "123e4567-e89b-12d3-a456-426614174000"}
            
            mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_result
            
            result = await service.resolve_repository_id("12345678", "user_123")
            
            # Should return the resolved ID
            assert result is not None


class TestCacheService:
    """Tests for cache service."""
    
    def test_generate_cache_key(self):
        """Test cache key generation."""
        from app.services.cache_service import AnalysisCacheService
        
        with patch('app.services.cache_service.Redis') as mock_redis_class:
            mock_redis = MagicMock()
            mock_redis.ping.return_value = True
            mock_redis_class.from_url.return_value = mock_redis
            
            with patch('app.services.cache_service.settings') as mock_settings:
                mock_settings.REDIS_URL = "redis://localhost:6379/0"
                
                service = AnalysisCacheService(redis_client=mock_redis)
                
                key1 = service._generate_cache_key("repo_1", "abc123", ["file1.py", "file2.py"])
                key2 = service._generate_cache_key("repo_1", "abc123", ["file2.py", "file1.py"])  # Different order
                key3 = service._generate_cache_key("repo_1", "def456", ["file1.py", "file2.py"])  # Different commit
                
                # Same files (sorted) should produce same key
                assert key1 == key2
                
                # Different commit should produce different key
                assert key1 != key3
    
    def test_cache_analysis(self):
        """Test caching analysis results."""
        from app.services.cache_service import AnalysisCacheService
        
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        
        with patch('app.services.cache_service.settings') as mock_settings:
            mock_settings.REDIS_URL = "redis://localhost:6379/0"
            
            service = AnalysisCacheService(redis_client=mock_redis)
            service.redis_available = True
            
            result = service.cache_analysis(
                repo_id="repo_1",
                results={"score": 85, "issues": []},
                commit_sha="abc123"
            )
            
            assert result == True
            mock_redis.setex.assert_called_once()


class TestGitHubService:
    """Tests for GitHub service."""
    
    @pytest.fixture
    def mock_github_client(self):
        """Create mock GitHub client."""
        return MagicMock()
    
    def test_rate_limit_check(self, mock_github_client):
        """Test rate limit checking."""
        from app.services.github_service import GitHubService
        
        with patch('app.services.github_service.Github', return_value=mock_github_client), \
             patch('app.services.github_service.get_redis_service') as mock_redis:
            
            mock_redis.return_value = MagicMock()
            
            # Mock rate limit response
            mock_rate_limit = MagicMock()
            mock_rate_limit.core.remaining = 100
            mock_rate_limit.core.reset.timestamp.return_value = 1234567890
            mock_github_client.get_rate_limit.return_value = mock_rate_limit
            
            service = GitHubService("test_token")
            result = service._check_rate_limit()
            
            assert result == True
    
    def test_is_code_file(self):
        """Test code file detection."""
        from app.services.github_service import GitHubService
        
        with patch('app.services.github_service.Github'), \
             patch('app.services.github_service.get_redis_service') as mock_redis:
            
            mock_redis.return_value = MagicMock()
            service = GitHubService("test_token")
            
            assert service._is_code_file("main.py") == True
            assert service._is_code_file("app.tsx") == True
            assert service._is_code_file("styles.css") == True
            assert service._is_code_file("image.png") == False
            assert service._is_code_file("document.pdf") == False


class TestPathValidation:
    """Tests for file path validation."""
    
    def test_valid_paths(self):
        """Test valid file paths."""
        from app.api.routes.github import validate_file_path
        
        assert validate_file_path("src/main.py") == "src/main.py"
        assert validate_file_path("README.md") == "README.md"
        assert validate_file_path("src/components/Button.tsx") == "src/components/Button.tsx"
        assert validate_file_path("/leading/slash.py") == "leading/slash.py"
    
    def test_path_traversal_blocked(self):
        """Test that path traversal is blocked."""
        from app.api.routes.github import validate_file_path
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path("../../../etc/passwd")
        assert exc_info.value.status_code == 400
        
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path("src/../../secret.py")
        assert exc_info.value.status_code == 400
    
    def test_sensitive_files_blocked(self):
        """Test that sensitive files are blocked."""
        from app.api.routes.github import validate_file_path
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path(".env")
        assert exc_info.value.status_code == 403
        
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path("config/secrets.pem")
        assert exc_info.value.status_code == 403


class TestRateLimiter:
    """Tests for rate limiter middleware."""
    
    def test_in_memory_bucket_consume(self):
        """Test in-memory token bucket."""
        from app.middleware.rate_limiter import InMemoryTokenBucket
        
        bucket = InMemoryTokenBucket(capacity=10, refill_rate=1.0)
        
        # Should allow first request
        allowed, info = bucket.consume("user_1")
        assert allowed == True
        assert info["remaining"] == 9
        
        # Consume all tokens
        for _ in range(9):
            bucket.consume("user_1")
        
        # Should be denied
        allowed, info = bucket.consume("user_1")
        assert allowed == False
    
    def test_in_memory_bucket_different_users(self):
        """Test that different users have separate buckets."""
        from app.middleware.rate_limiter import InMemoryTokenBucket
        
        bucket = InMemoryTokenBucket(capacity=5, refill_rate=1.0)
        
        # User 1 consumes all tokens
        for _ in range(5):
            bucket.consume("user_1")
        
        # User 1 should be denied
        allowed, _ = bucket.consume("user_1")
        assert allowed == False
        
        # User 2 should still have tokens
        allowed, _ = bucket.consume("user_2")
        assert allowed == True


# Run tests with: pytest tests/test_services.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
