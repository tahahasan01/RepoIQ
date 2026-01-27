from typing import Dict, List, Any, Optional
from .security_agent import SecurityAgent
from .quality_agent import CodeQualityAgent
from .architecture_agent import ArchitectureAgent
from .documentation_agent import DocumentationAgent
from .conversational_agent import ConversationalAgent
from .best_practices_agent import BestPracticesAgent
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
        self.best_practices_agent = BestPracticesAgent()
        
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
        
        # Process ALL files in just 1-2 batches to minimize AI calls!
        batch_size = 8  # Analyze 8 files per AI call (sweet spot for quality vs speed)
        total_batches = (len(files) + batch_size - 1) // batch_size
        
        logger.info(f"⚡ Fast mode: Processing {len(files)} files in {total_batches} batches ({batch_size} files/batch = {total_batches} AI calls)")
        
        # Process batches in parallel for even faster analysis!
        async def process_batch(batch, batch_num):
            logger.info(f"🔍 Analyzing batch {batch_num}/{total_batches} ({len(batch)} files)...")
            try:
                batch_result = await self._analyze_file_batch(batch, project_context)
                if batch_result and "issues" in batch_result:
                    logger.info(f"✅ Batch {batch_num} complete: {len(batch_result['issues'])} issues found")
                    return batch_result
            except Exception as e:
                logger.error(f"❌ Batch {batch_num} failed: {str(e)}")
                return None
        
        # Run up to 4 batches in parallel for maximum speed
        parallel_batches = 4
        batches = [files[i:i + batch_size] for i in range(0, len(files), batch_size)]
        
        for i in range(0, len(batches), parallel_batches):
            parallel_batch_group = batches[i:i+parallel_batches]
            results = await asyncio.gather(
                *[process_batch(batch, i+idx+1) for idx, batch in enumerate(parallel_batch_group)],
                return_exceptions=True
            )
            
            for batch_result in results:
                if batch_result and isinstance(batch_result, dict) and "issues" in batch_result:
                    all_issues.extend(batch_result["issues"])
                    total_security_score += batch_result.get("security_score", 50)
                    total_quality_score += batch_result.get("quality_score", 50)
                    total_architecture_score += batch_result.get("architecture_score", 50)
                    batch_count_actual += 1
        
        # Run BOTH static analyses IN PARALLEL for all files (much faster!)
        logger.info("Running static analysis (best practices + security) in parallel...")
        
        async def run_static_analysis_parallel():
            best_practice_tasks = []
            security_tasks = []
            
            for file_data in files:
                content = file_data.get("content", "")
                path = file_data.get("path", "")
                
                # Create async wrappers for static analysis
                async def run_best_practices(c=content, p=path):
                    try:
                        return self.best_practices_agent._run_static_analysis(
                            c, p, self.best_practices_agent._detect_language(p)
                        )
                    except Exception as e:
                        logger.error(f"Best practices failed for {p}: {e}")
                        return []
                
                async def run_security(c=content, p=path):
                    try:
                        return self.security_agent._run_static_analysis(
                            c, p, self.security_agent._detect_language(p)
                        )
                    except Exception as e:
                        logger.error(f"Security failed for {p}: {e}")
                        return []
                
                best_practice_tasks.append(run_best_practices())
                security_tasks.append(run_security())
            
            # Run ALL static analysis in parallel
            all_results = await asyncio.gather(
                *best_practice_tasks, *security_tasks,
                return_exceptions=True
            )
            
            issues = []
            for result in all_results:
                if isinstance(result, list):
                    issues.extend(result)
            return issues
        
        static_issues = await run_static_analysis_parallel()
        all_issues.extend(static_issues)
        logger.info(f"Static analysis found {len(static_issues)} issues")
        
        # Calculate issue counts
        critical_count = len([i for i in all_issues if i.get("severity") == "critical"])
        high_count = len([i for i in all_issues if i.get("severity") == "high"])
        medium_count = len([i for i in all_issues if i.get("severity") == "medium"])
        low_count = len([i for i in all_issues if i.get("severity") == "low"])
        
        # Calculate realistic scores based on actual issues found
        # Perfect 100 only if truly no issues AND small codebase
        if batch_count_actual > 0:
            avg_security = total_security_score / batch_count_actual
            avg_quality = total_quality_score / batch_count_actual
            avg_architecture = total_architecture_score / batch_count_actual
        else:
            # Fallback scores if no batches completed
            avg_security = 75
            avg_quality = 70
            avg_architecture = 75
        
        # Adjust scores based on actual issues found (more realistic)
        if critical_count > 0:
            avg_security = min(avg_security, 60 - (critical_count * 10))
        if high_count > 0:
            avg_security = min(avg_security, 75 - (high_count * 5))
            avg_quality = min(avg_quality, 75 - (high_count * 5))
        if medium_count > 5:
            avg_quality = min(avg_quality, 70 - (medium_count * 2))
        
        # Ensure scores are realistic (never perfect unless truly exceptional)
        avg_security = max(30, min(avg_security, 95))
        avg_quality = max(30, min(avg_quality, 95))
        avg_architecture = max(30, min(avg_architecture, 95))
        
        # Overall score is weighted average
        overall = (avg_security * 0.4 + avg_quality * 0.35 + avg_architecture * 0.25)
        
        logger.info(f"📊 Final scores: Overall={int(overall)}, Security={int(avg_security)}, Quality={int(avg_quality)}, Arch={int(avg_architecture)}")
        logger.info(f"📊 Issues breakdown: {critical_count} critical, {high_count} high, {medium_count} medium, {low_count} low")
        
        # Calculate documentation score from documentation issues
        doc_issues = [i for i in all_issues if i.get("agent_type") == "documentation" or "document" in i.get("category", "").lower()]
        doc_score = max(50, 100 - (len(doc_issues) * 5))  # Penalty for each doc issue
        
        logger.info(f"📊 Documentation: {len(doc_issues)} issues found, score={doc_score}")
        
        return {
            "overall_score": int(overall),
            "security_score": int(avg_security),
            "quality_score": int(avg_quality),
            "architecture_score": int(avg_architecture),
            "documentation_score": doc_score,
            "total_issues": len(all_issues),
            "critical_issues": critical_count,
            "high_issues": high_count,
            "medium_issues": medium_count,
            "low_issues": low_count,
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
        import json
        toon = get_toon_service()
        
        # Compress files using TOON
        compressed = toon.compress_code_context(files, max_chars=30000)
        
        # Single comprehensive analysis prompt with best practices
        file_list = "\n".join([f"- {f['path']}" for f in files])
        prompt = f"""You are a STRICT code reviewer. Analyze these {len(files)} files and find ALL problems.

Files to analyze:
{file_list}

Code (TOON compressed):
{compressed}

YOU MUST FIND ISSUES. Real code always has problems. Look for:

🔴 SECURITY (CRITICAL - Find these!):
- SQL injection: ANY string concatenation/f-string/format in queries
- Hardcoded passwords, API keys, tokens
- Missing input validation
- Command injection (os.system, subprocess with shell=True)
- Path traversal vulnerabilities
- XSS vulnerabilities
- Missing authentication/authorization

⚠️ CODE QUALITY (Find at least 3-5):
- Long functions (>50 lines)
- Deep nesting (>3 levels)
- Code duplication
- Magic numbers
- Missing error handling
- Poor variable names
- Commented-out code
- Unused imports/variables
- Complex conditionals

🏗️ ARCHITECTURE:
- Tight coupling
- Missing separation of concerns
- Hardcoded configuration
- Missing dependency injection
- Poor error handling patterns

📦 BEST PRACTICES:
- Missing rate limiting on APIs
- Missing caching
- Missing debouncing
- Missing timeouts on requests
- N+1 query problems
- Missing pagination

SCORING RULES (Be REALISTIC):
- Perfect 100 is IMPOSSIBLE - real code always has issues
- If you find 0 critical issues: security_score = 70-90
- If you find 1+ critical: security_score = 30-60
- If you find 5+ quality issues: quality_score = 50-70
- If you find 10+ issues total: all scores should be 40-70

YOU MUST return ONLY valid JSON (no markdown):
{{
  "issues": [
    {{
      "severity": "critical|high|medium|low",
      "category": "sql_injection|hardcoded_secret|missing_error_handling|long_function|etc",
      "file_path": "exact/path/from/list",
      "line_number": 1,
      "description": "Specific problem found",
      "suggestion": "How to fix it"
    }}
  ],
  "security_score": 75,
  "quality_score": 60,
  "architecture_score": 70
}}

IMPORTANT: You MUST find at least 5 real issues. Real code is never perfect!"""
        
        try:
            # Direct LLM call with better JSON extraction
            messages = [
                {"role": "system", "content": "You are a code analysis AI. Return ONLY valid JSON, no markdown or explanations."},
                {"role": "user", "content": prompt}
            ]
            
            response = await self.security_agent._call_llm(messages, temperature=0.3)
            logger.info(f"Raw AI response length: {len(response)} chars")
            
            # Extract JSON from response (handle markdown wrapping)
            json_str = response.strip()
            if "```json" in json_str:
                json_start = json_str.find("```json") + 7
                json_end = json_str.find("```", json_start)
                json_str = json_str[json_start:json_end].strip()
            elif "```" in json_str:
                json_start = json_str.find("```") + 3
                json_end = json_str.find("```", json_start)
                json_str = json_str[json_start:json_end].strip()
            
            result = json.loads(json_str)
            logger.info(f"Parsed {len(result.get('issues', []))} issues, scores: sec={result.get('security_score')}, qual={result.get('quality_score')}, arch={result.get('architecture_score')}")
            
            # Ensure all issues have required fields
            for issue in result.get("issues", []):
                if "file_path" not in issue and len(files) == 1:
                    issue["file_path"] = files[0]["path"]
                if "line_number" not in issue:
                    issue["line_number"] = 1
                # Set agent_type based on category (required by database)
                if "agent_type" not in issue:
                    category = issue.get("category", "").lower()
                    if "security" in category or "vulnerability" in category or "injection" in category:
                        issue["agent_type"] = "security"
                    elif "architecture" in category or "design" in category or "structure" in category:
                        issue["agent_type"] = "architecture"
                    elif "document" in category or "comment" in category:
                        issue["agent_type"] = "documentation"
                    elif "rate_limit" in category or "cache" in category or "debounce" in category or "throttle" in category or "best_practice" in category:
                        issue["agent_type"] = "best_practices"
                    else:
                        issue["agent_type"] = "quality"  # Default to quality
            
            return result
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            logger.error(f"Response was: {response[:500]}...")
            return {"issues": [], "security_score": 50, "quality_score": 50, "architecture_score": 50}
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
