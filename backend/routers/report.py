from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
import base64
from sqlalchemy.orm import Session
from database import get_db
from services.report_service import ReportService

router = APIRouter(prefix="/api/report", tags=["Match Report"])

@router.get("/match")
def get_match_report(
    match_id: int = Query(..., description="Match ID"),
    db: Session = Depends(get_db)
):
    """Auto-generate a full visual match report. Returns base64 PNG + PDF."""
    result = ReportService.generate_match_report(db, match_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    # Return metadata + base64 encoded assets
    return {
        "match_id": result["match_id"],
        "home_team": result["home_team"],
        "away_team": result["away_team"],
        "score": result["score"],
        "report_png": result["report_png"],
        "report_pdf": result["report_pdf"],
    }

@router.get("/match/download-pdf")
def download_match_report_pdf(
    match_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Download the match report as a PDF file."""
    result = ReportService.generate_match_report(db, match_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    pdf_bytes = base64.b64decode(result["report_pdf"])
    filename = f"match_report_{match_id}_{result['home_team']}_vs_{result['away_team']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
