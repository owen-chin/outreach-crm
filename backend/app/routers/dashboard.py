from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import ContactStatus, Project, User
from app.schemas.schemas import AttentionItemOut, DashboardOut, ProjectDashboardOut
from app.services.auth_utils import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

FOLLOW_UP_STALE_DAYS = 5
DEADLINE_WINDOW_DAYS = 14
MAX_ATTENTION_ITEMS = 20


@router.get("", response_model=DashboardOut)
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )

    now = datetime.now(timezone.utc)
    today = now.date()

    project_stats = []
    ranked_attention = []  # (sort_key, AttentionItemOut)

    for project in projects:
        orgs = [org for category in project.categories for org in category.organizations]
        org_count = len(orgs)
        confirmed_count = sum(1 for o in orgs if o.status == ContactStatus.confirmed)
        negotiating_count = sum(1 for o in orgs if o.status == ContactStatus.negotiating)
        outreach_count = sum(1 for o in orgs if o.status != ContactStatus.not_contacted)

        latest_activity = max([o.updated_at for o in orgs] + [project.created_at])

        project_stats.append(ProjectDashboardOut(
            id=project.id,
            name=project.name,
            date=project.date,
            description=project.description,
            org_count=org_count,
            confirmed_count=confirmed_count,
            negotiating_count=negotiating_count,
            category_count=len(project.categories),
            outreach_pct=(outreach_count / org_count) if org_count else 0.0,
            updated_at=latest_activity,
        ))

        for org in orgs:
            if org.status == ContactStatus.responded:
                ranked_attention.append((
                    (1, -org.updated_at.timestamp()),
                    AttentionItemOut(
                        type="new_reply",
                        project_id=project.id,
                        project_name=project.name,
                        org_id=org.id,
                        org_name=org.name,
                        note="Replied — awaiting your response",
                    ),
                ))
            elif org.status == ContactStatus.contacted and org.last_contacted_date:
                stale_days = (now - org.last_contacted_date).days
                if stale_days > FOLLOW_UP_STALE_DAYS:
                    ranked_attention.append((
                        (1, -org.last_contacted_date.timestamp()),
                        AttentionItemOut(
                            type="follow_up",
                            project_id=project.id,
                            project_name=project.name,
                            org_id=org.id,
                            org_name=org.name,
                            note=f"No response in {stale_days} days",
                        ),
                    ))

        if project.date:
            days_until = (project.date - today).days
            if 0 <= days_until <= DEADLINE_WINDOW_DAYS:
                ranked_attention.append((
                    (0, days_until),
                    AttentionItemOut(
                        type="deadline",
                        project_id=project.id,
                        project_name=project.name,
                        note=f"{project.date.isoformat()} — {days_until} day{'s' if days_until != 1 else ''} away",
                    ),
                ))

    ranked_attention.sort(key=lambda pair: pair[0])
    attention = [item for _, item in ranked_attention[:MAX_ATTENTION_ITEMS]]

    return DashboardOut(projects=project_stats, attention=attention)
