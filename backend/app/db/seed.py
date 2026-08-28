"""Seed the 18 launch categories from docs/PROJECT_BRIEF.md.

Run after migrations: `python -m app.db.seed`
Idempotent — safe to run multiple times.
"""

from app.db.session import SessionLocal
from app.models.category import Category

LAUNCH_CATEGORIES = [
    "Manufacturing",
    "Agriculture",
    "Education",
    "Health",
    "Technology",
    "Science",
    "Construction",
    "Automotive",
    "Retail",
    "Beauty & Lifestyle",
    "Energy",
    "Finance",
    "Hospitality",
    "Arts & Culture",
    "Books & Journals",
    "Entertainment",
    "DIY",
    "Professional Services",
]


def slugify(name: str) -> str:
    return name.lower().replace(" & ", "-").replace(" ", "-")


def seed_categories() -> None:
    db = SessionLocal()
    try:
        existing = {c.slug for c in db.query(Category).all()}
        created = 0
        for name in LAUNCH_CATEGORIES:
            slug = slugify(name)
            if slug in existing:
                continue
            db.add(Category(name=name, slug=slug))
            created += 1
        db.commit()
        skipped = len(LAUNCH_CATEGORIES) - created
        print(f"Seeded {created} new categories ({skipped} already present).")
    finally:
        db.close()


if __name__ == "__main__":
    seed_categories()
