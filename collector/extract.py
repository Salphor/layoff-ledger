import os
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List, Optional

class LayoffExtraction(BaseModel):
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

def extract_layoff_facts(title: str, content: str) -> Optional[LayoffExtraction]:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    prompt = f"""
    Analyze the following article title and content regarding potential workforce reductions.
    Extract factual details strict to the provided text. Do not invent numbers or dates.

    Title: {title}
    Content: {content}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=LayoffExtraction,
                temperature=0.1,
            ),
        )
        return LayoffExtraction.model_validate_json(response.text)
    except Exception as e:
        print(f"Gemini Extraction Error: {e}")
        return None