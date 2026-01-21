from typing import Dict, List, Any, Optional
from .security_agent import SecurityAgent
from .quality_agent import CodeQualityAgent
from .architecture_agent import ArchitectureAgent
from .documentation_agent import DocumentationAgent
from .conversational_agent import ConversationalAgent
from app.core.logging import get_logger
import asyncio

logger = get_logger(__name__)


class AgentOrchestrator:
    def __init__(self):
        self.security_agent = SecurityAgent()
        self.quality_agent = CodeQualityAgent()
        self.architecture_agent = ArchitectureAgent()
        self.documentation_agent = DocumentationAgent()
        self.conversational_agent = ConversationalAgent()
        
    async def analyze_repository(
        self,
        files: List[Dict[str, str]],
        project_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        logger.info(f"Starting fast batch analysis for {len(files)} files")
        
        all_issues = []
        total_security_score = 0
        total_quality_score = 0
        total_architecture_score = 0
        batch_count_actual = 0
        
        # Process files in larger batches (5 files per AI call)
        batch_size = 5
        total_batches = (len(files) + batch_size - 1) // batch_size
        
        for i in range(0, len(files), batch_size):
            batch = files[i:i + batch_size]
            batch_num = i // batch_size + 1
            logger.info(f"Analyzing batch {batch_num}/{total_batches} ({len(batch)} files)...")
            
            try:
                # Analyze entire batch in one AI call
                batch_result = await self._analyze_file_batch(batch, project_context)
                
                if batch_result and "issues" in batch_result:
                    all_issues.extend(batch_result["issues"])
                    total_security_score += batch_result.get("security_score", 50)
                    total_quality_score += batch_result.get("quality_score", 50)
                    total_architecture_score += batch_result.get("architecture_score", 50)
                    batch_count_actual += 1
                    logger.info(f"✓ Batch {batch_num} complete: {len(batch_result['issues'])} issues found")
            except Exception as e:
                logger.error(f"Batch {batch_num} failed: {str(e)}")
                continue
        
        # Calculate average scores
        avg_security = total_security_score / batch_count_actual if batch_count_actual > 0 else 50
        avg_quality = total_quality_score / batch_count_actual if batch_count_actual > 0 else 50
        avg_architecture = total_architecture_score / batch_count_actual if batch_count_actual > 0 else 50
        overall = (avg_security + avg_quality + avg_architecture) / 3
        
        return {
            "overall_score": int(overall),
            "security_score": int(avg_security),
            "quality_score": int(avg_quality),
            "architecture_score": int(avg_architecture),
            "documentation_score": 100,
            "total_issues": len(all_issues),
            "critical_issues": len([i for i in all_issues if i.get("severity") == "critical"]),
            "high_issues": len([i for i in all_issues if i.get("severity") == "high"]),
            "medium_issues": len([i for i in all_issues if i.get("severity") == "medium"]),
            "low_issues": len([i for i in all_issues if i.get("severity") == "low"]),
            "issues": all_issues,
            "agent_results": {},
            "files_analyzed": len(files)
        }
    
    async def _analyze_file_batch(
        self,
        files: List[Dict[str, str]],
        project_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze multiple files in a single AI call for speed."""
        from app.services.toon_service import get_toon_service
        toon = get_toon_service()
        
        # Compress files using TOON
        compressed = toon.compress_code_context(files, max_chars=30000)
        
        # Single comprehensive analysis prompt
        file_list = "\n".join([f"- {f['path']}" for f in files])
        prompt = f"""Analyze these {len(files)} files for ALL issues (security, quality, architecture, documentation).

Files to analyze:
{file_list}

Code (TOON compressed):
{compressed}

Return JSON with this exact structure:
{{
  "issues": [{{
    "severity": "critical|high|medium|low",
    "category": "security|quality|architecture|documentation",
    "file_path": "exact/path/from/list/above",
    "line_number": 1,
    "message": "Clear description of the issue",
    "suggestion": "How to fix it"
  }}],
  "security_score": 85,
  "quality_score": 75,
  "architecture_score": 90
}}

Focus on the most important issues."""
        
        try:
            # Use security agent as unified analyzer
            result = await self.security_agent.analyze(prompt, "", project_context)
            return result if result else {"issues": [], "security_score": 50, "quality_score": 50, "architecture_score": 50}
        except Exception as e:
            logger.error(f"Batch analysis error: {e}")
            return {"issues": [], "security_score": 50, "quality_score": 50, "architecture_score": 50}
    
    async def _analyze_file(
        self,
        file_path: str,
        code: str,
        project_context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        results = {}
        
        try:
            security_result = await self.security_agent.analyze(code, file_path, project_context)
            results["security"] = security_result
        except Exception as e:
            logger.error(f"Security analysis failed for {file_path}: {str(e)}")
            results["security"] = None
        
        try:
            quality_result = await self.quality_agent.analyze(code, file_path, project_context)
            results["quality"] = quality_result
        except Exception as e:
            logger.error(f"Quality analysis failed for {file_path}: {str(e)}")
            results["quality"] = None
        
        try:
            architecture_result = await self.architecture_agent.analyze(code, file_path, project_context)
            results["architecture"] = architecture_result
        except Exception as e:
            logger.error(f"Architecture analysis failed for {file_path}: {str(e)}")
            results["architecture"] = None
        
        try:
            doc_result = await self.documentation_agent.analyze(code, file_path, project_context)
            results["documentation"] = doc_result
        except Exception as e:
            logger.error(f"Documentation analysis failed for {file_path}: {str(e)}")
            results["documentation"] = None
        
        return results
    
    def _calculate_overall_scores(self, agent_results: Dict[str, Any]) -> Dict[str, int]:
        scores = {}
        
        if agent_results["security"] and "score" in agent_results["security"]:
            scores["security"] = agent_results["security"]["score"]
        else:
            scores["security"] = 100
        
        if agent_results["quality"] and "score" in agent_results["quality"]:
            scores["quality"] = agent_results["quality"]["score"]
        else:
            scores["quality"] = 100
        
        if agent_results["architecture"] and "score" in agent_results["architecture"]:
            scores["architecture"] = agent_results["architecture"]["score"]
        else:
            scores["architecture"] = 100
        
        if agent_results["documentation"] and "score" in agent_results["documentation"]:
            scores["documentation"] = agent_results["documentation"]["score"]
        else:
            scores["documentation"] = 100
        
        scores["overall"] = int(
            (scores["security"] * 0.35) +
            (scores["quality"] * 0.30) +
            (scores["architecture"] * 0.25) +
            (scores["documentation"] * 0.10)
        )
        
        return scores
    
    async def generate_improvement_roadmap(self, issues: List[Dict[str, Any]]) -> Dict[str, Any]:
        critical_issues = [i for i in issues if i.get("severity") == "critical"]
        high_issues = [i for i in issues if i.get("severity") == "high"]
        medium_issues = [i for i in issues if i.get("severity") == "medium"]
        low_issues = [i for i in issues if i.get("severity") == "low"]
        
        quick_wins = []
        for issue in critical_issues[:5]:
            if issue.get("auto_fixable"):
                quick_wins.append({
                    "issue": issue.get("message", issue.get("description", "No description")),
                    "category": issue["category"],
                    "impact": "high",
                    "effort": "low"
                })
        
        medium_term = []
        for issue in high_issues[:10]:
            medium_term.append({
                "issue": issue.get("message", issue.get("description", "No description")),
                "category": issue["category"],
                "impact": "high",
                "effort": "medium"
            })
        
        long_term = []
        architecture_issues = [i for i in issues if i.get("agent_type") == "architecture"]
        for issue in architecture_issues[:5]:
            long_term.append({
                "issue": issue.get("message", issue.get("description", "No description")),
                "category": issue["category"],
                "impact": "medium",
                "effort": "high"
            })
        
        return {
            "priority_order": ["critical", "high", "medium", "low"],
            "quick_wins": quick_wins,
            "medium_term": medium_term,
            "long_term": long_term,
            "estimated_impact": {
                "security_improvement": len([i for i in quick_wins + medium_term if "security" in i.get("category", "").lower()]) * 5,
                "quality_improvement": len([i for i in quick_wins + medium_term if "quality" in i.get("category", "").lower()]) * 3,
                "maintainability_improvement": len(long_term) * 10
            }
        }
    
    async def auto_fix_issues(self, issues: List[Dict[str, Any]], code_files: Dict[str, str]) -> List[Dict[str, Any]]:
        fixes = []
        
        for issue in issues:
            if not issue.get("auto_fixable"):
                continue
            
            file_path = issue.get("file_path")
            if file_path not in code_files:
                continue
            
            code = code_files[file_path]
            
            try:
                if issue.get("agent_type") == "security":
                    fixed_code = await self.security_agent.generate_fix(issue, code)
                    if fixed_code:
                        fixes.append({
                            "issue_id": issue.get("id"),
                            "file_path": file_path,
                            "original_code": code,
                            "fixed_code": fixed_code,
                            "description": issue["description"]
                        })
            except Exception as e:
                logger.error(f"Auto-fix failed for issue: {str(e)}")
        
        return fixes
