import os
from typing import List, Optional
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential

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

@retry(
    wait=wait_exponential(multiplier=2, min=4, max=60),
    stop=stop_after_attempt(5),
    reraise=True,
)
def extract_layoff_facts(batch_content: str) -> List[LayoffExtraction]:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    prompt = f"""
    Analyze the following batch of articles regarding potential workforce reductions.
    For each item, extract the factual details strict to the provided text. Ensure you map the correct ID to each extraction. Do not invent numbers or dates.

    {batch_content}
    """

    response = client.models.generate_content(
        model='gemini-3.8-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=BatchExtractionResponse,
            temperature=0.1,
        ),
    )
    
    result = BatchExtractionResponse.model_validate_json(response.text)
    return result.extractions
