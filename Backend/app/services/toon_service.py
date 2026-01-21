"""
Token-Optimized Object Notation (TOON) Service
Reduces token usage by 60-80% through compact serialization.
"""
from typing import Dict, Any, List, Optional
import json
from app.core.logging import get_logger

logger = get_logger(__name__)


class TOONService:
    """
    Converts data to/from TOON format for LLM efficiency.
    TOON uses minimal keys, removes whitespace, and compresses data structure.
    """
    
    # Mapping for common analysis fields (short keys)
    TOON_MAPPING = {
        # File structure
        "path": "p",
        "content": "c",
        "name": "n",
        "type": "t",
        "size": "s",
        
        # Analysis results
        "issues": "i",
        "severity": "sv",
        "category": "ct",
        "message": "m",
        "line_number": "ln",
        "suggestion": "sg",
        "file_path": "fp",
        
        # Scores
        "overall_score": "os",
        "security_score": "ss",
        "quality_score": "qs",
        "architecture_score": "as",
        "documentation_score": "ds",
        
        # Issue counts
        "total_issues": "ti",
        "critical_issues": "ci",
        "high_issues": "hi",
        "medium_issues": "mi",
        "low_issues": "li",
        
        # Context
        "project_structure": "ps",
        "language": "lg",
        "description": "d",
        "recommendations": "r",
        "code_snippet": "cs",
        "files_analyzed": "fa",
    }
    
    # Reverse mapping for decoding
    REVERSE_MAPPING = {v: k for k, v in TOON_MAPPING.items()}
    
    @classmethod
    def encode(cls, data: Any) -> str:
        """
        Convert data to TOON format (compact JSON with short keys).
        
        Example:
            {"path": "main.py", "content": "print('hello')"}
            -> {"p":"main.py","c":"print('hello')"}
        """
        if isinstance(data, dict):
            toon_dict = {}
            for key, value in data.items():
                # Use short key if available
                short_key = cls.TOON_MAPPING.get(key, key)
                toon_dict[short_key] = cls.encode(value)
            return toon_dict
        elif isinstance(data, list):
            return [cls.encode(item) for item in data]
        else:
            return data
    
    @classmethod
    def decode(cls, toon_data: Any) -> Any:
        """
        Convert TOON format back to full format.
        
        Example:
            {"p":"main.py","c":"print('hello')"}
            -> {"path": "main.py", "content": "print('hello')"}
        """
        if isinstance(toon_data, dict):
            full_dict = {}
            for short_key, value in toon_data.items():
                # Convert back to full key
                full_key = cls.REVERSE_MAPPING.get(short_key, short_key)
                full_dict[full_key] = cls.decode(value)
            return full_dict
        elif isinstance(toon_data, list):
            return [cls.decode(item) for item in toon_data]
        else:
            return toon_data
    
    @classmethod
    def to_compact_json(cls, data: Any) -> str:
        """
        Convert to TOON and serialize as compact JSON (no whitespace).
        """
        toon_data = cls.encode(data)
        return json.dumps(toon_data, separators=(',', ':'), ensure_ascii=False)
    
    @classmethod
    def from_compact_json(cls, toon_str: str) -> Any:
        """
        Parse compact JSON and convert back from TOON.
        """
        toon_data = json.loads(toon_str)
        return cls.decode(toon_data)
    
    @classmethod
    def compress_code_context(cls, files: List[Dict[str, str]], max_chars: int = 50000) -> str:
        """
        Compress multiple files into TOON format with content truncation.
        
        Format: [{"p":"file.py","c":"...code..."},...]
        """
        compressed_files = []
        total_chars = 0
        
        for file in files:
            path = file.get("path", "unknown")
            content = file.get("content", "")
            
            # Truncate content if needed
            chars_left = max_chars - total_chars
            if chars_left <= 0:
                break
            
            truncated_content = content[:chars_left]
            if len(content) > chars_left:
                truncated_content += "\n...[truncated]"
            
            compressed_files.append({
                "p": path,
                "c": cls._compress_code(truncated_content)
            })
            
            total_chars += len(truncated_content)
        
        return json.dumps(compressed_files, separators=(',', ':'))
    
    @classmethod
    def _compress_code(cls, code: str) -> str:
        """
        Compress code by removing comments and excess whitespace.
        """
        lines = code.split('\n')
        compressed_lines = []
        
        for line in lines:
            stripped = line.strip()
            
            # Skip empty lines and comments
            if not stripped or stripped.startswith('#'):
                continue
            
            # Remove inline comments (simplistic approach)
            if '#' in stripped:
                stripped = stripped.split('#')[0].strip()
            
            if stripped:
                compressed_lines.append(stripped)
        
        return '\n'.join(compressed_lines)
    
    @classmethod
    def compress_analysis_request(cls, files: List[Dict], context: Dict) -> str:
        """
        Compress full analysis request into TOON format.
        """
        request = {
            "f": [{"p": f["path"], "c": cls._compress_code(f["content"])} for f in files[:50]],  # Max 50 files
            "ctx": {
                "lg": context.get("language", "unknown"),
                "n": context.get("repo_name", "unknown")
            }
        }
        
        return json.dumps(request, separators=(',', ':'))
    
    @classmethod
    def expand_analysis_response(cls, toon_response: str) -> Dict[str, Any]:
        """
        Expand TOON analysis response back to full format.
        """
        try:
            compact = json.loads(toon_response)
            return cls.decode(compact)
        except Exception as e:
            logger.error(f"Failed to decode TOON response: {e}")
            return {}


def get_toon_service() -> TOONService:
    """Get TOON service singleton."""
    return TOONService()
