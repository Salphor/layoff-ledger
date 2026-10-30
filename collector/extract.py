import os
from typing import List, Optional
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential


class GeminiQuotaExhausted(Exception):
    """The free-tier daily request limit is used up. Retrying only wastes time
    (and, after midnight Pacific, tomorrow's quota), so callers should stop
    sending requests for the rest of the run."""


def _is_quota_error(exc) -> bool:
    text = str(exc)
    return "RESOURCE_EXHAUSTED" in text or " 429" in f" {text}"


def _is_temporary_error(exc) -> bool:
    """Worth one or two more tries: model overloaded (503), server error, timeout."""
    if isinstance(exc, GeminiQuotaExhausted):
        return False
    text = str(exc)
    return any(code in text for code in ("503", "UNAVAILABLE", "500", "INTERNAL", "DEADLINE", "imed out", "Timeout"))

# Give up on a single request after this long, so one slow call can't eat the
# whole run (some calls were taking 5+ minutes).
REQUEST_TIMEOUT_MS = 90_000

class LayoffExtraction(BaseModel):
    source_id: int = Field(description="The numeric ID corresponding to the Item ID provided in the prompt.")
    is_layoff: bool = Field(description="True if this text reports an actual or planned workforce reduction.")
    company_name: str = Field(description="Canonical corporate name of the employer.")
    announcement_date: Optional[str] = Field(None, description="YYYY-MM-DD date when layoff was announced.")
    effective_date: Optional[str] = Field(None, description="YYYY-MM-DD date when layoff takes effect.")
    employees_affected: Optional[int] = Field(None, description="Exact integer of employees affected if stated.")
    employee_count_text: Optional[str] = Field(None, description="Text representation, e.g. 'approx 500' or '10% of staff'.")
    locations: List[str] = Field(default_factory=list, description="List of affected cities/states/locations.")
    departments: List[str] = Field(default_factory=list, description="List of affected departments or divisions.")
    roles: List[str] = Field(default_factory=list, description="List of specific roles affected.")
    reason_provided: Optional[str] = Field(None, description="Company's stated reason for workforce reduction.")
    summary: str = Field(description="Objective 2-3 sentence factual summary grounded ONLY in the source text.")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0.")

class BatchExtractionResponse(BaseModel):
    extractions: List[LayoffExtraction] = Field(default_factory=list)

# Each attempt counts against the 20-requests-per-day free quota, so retry a
# temporary error only once (2 tries in total), and never a quota error.
@retry(
    retry=retry_if_exception(_is_temporary_error),
    wait=wait_exponential(multiplier=2, min=10, max=30),
    stop=stop_after_attempt(2),
    reraise=True,
)
def extract_layoff_facts(batch_content: str) -> List[LayoffExtraction]:
    client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY"),
        http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
    )

    prompt = f"""
    Analyze the following batch of articles regarding potential workforce reductions.
    For each item, extract the factual details strict to the provided text. Ensure you map the correct ID to each extraction. Do not invent numbers or dates.

    {batch_content}
    """

    try:
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BatchExtractionResponse,
                temperature=0.1,
            ),
        )
    except Exception as e:
        if _is_quota_error(e):
            raise GeminiQuotaExhausted(str(e)[:300]) from e
        raise
    
    result = BatchExtractionResponse.model_validate_json(response.text)
    return result.extractions
