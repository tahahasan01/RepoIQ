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
        logger.info(f"Starting repository analysis for {len(files)} files")
        
        all_issues = []
        agent_results = {
            "security": None,
            "quality": None,
            "architecture": None,
            "documentation": None
        }
        
        tasks = []
        for file_data in files[:20]:
            file_path = file_data["path"]
            code = file_data["content"]
            
            tasks.append(self._analyze_file(file_path, code, project_context))
        
        file_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in file_results:
            if isinstance(result, Exception):
                logger.error(f"File analysis failed: {str(result)}")
                continue
            
            for agent_type, agent_result in result.items():
                if agent_result and "issues" in agent_result:
                    all_issues.extend(agent_result["issues"])
                    
                    if agent_results[agent_type] is None:
                        agent_results[agent_type] = agent_result
                    else:
                        agent_results[agent_type]["issues"].extend(agent_result["issues"])
                        agent_results[agent_type]["files_analyzed"] += agent_result.get("files_analyzed", 0)
        
        overall_scores = self._calculate_overall_scores(agent_results)
        
        return {
            "overall_score": overall_scores["overall"],
            "security_score": overall_scores["security"],
            "quality_score": overall_scores["quality"],
            "architecture_score": overall_scores["architecture"],
            "documentation_score": overall_scores.get("documentation", 100),
            "total_issues": len(all_issues),
            "critical_issues": len([i for i in all_issues if i.get("severity") == "critical"]),
            "high_issues": len([i for i in all_issues if i.get("severity") == "high"]),
            "medium_issues": len([i for i in all_issues if i.get("severity") == "medium"]),
            "low_issues": len([i for i in all_issues if i.get("severity") == "low"]),
            "issues": all_issues,
            "agent_results": agent_results,
            "files_analyzed": len(files)
        }
    
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
                    "issue": issue["description"],
                    "category": issue["category"],
                    "impact": "high",
                    "effort": "low"
                })
        
        medium_term = []
        for issue in high_issues[:10]:
            medium_term.append({
                "issue": issue["description"],
                "category": issue["category"],
                "impact": "high",
                "effort": "medium"
            })
        
        long_term = []
        architecture_issues = [i for i in issues if i.get("agent_type") == "architecture"]
        for issue in architecture_issues[:5]:
            long_term.append({
                "issue": issue["description"],
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
