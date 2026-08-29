"""Seed demo businesses/products for local testing and PM review.

Mirrors the approved design prototype's fixture dataset (docs/design/
prototype-v1.html BUSINESSES/PRODUCTS, also ported to
frontend/src/data/{businesses,products}.ts) so the real, API-backed
Search/Business-profile/Product-detail screens have something real to
show instead of empty states — and so slugs match what the frontend's
still-fixture-driven Home screen links to, until Home is rewired onto
the real API too.

NOT for production — creates a demo owner account with a known password.
Run after migrations + category seed: `python -m app.db.seed_demo`
Idempotent — safe to run multiple times (matches on slug).
"""

from __future__ import annotations

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.business import Business, VerificationStatus
from app.models.category import Category
from app.models.product import AvailabilityStatus, ModerationStatus, Product
from app.models.user import User, UserRole

DEMO_OWNER_EMAIL = "demo-owner@miles.tech"
DEMO_OWNER_PASSWORD = "DemoPass123!"  # noqa: S105 - seed-only, not a real credential

BUSINESSES = [
    dict(
        slug="aquatank",
        name="AquaTank Kenya Ltd",
        category_slug="manufacturing",
        city="Nairobi",
        county="Nairobi",
        address_line="Industrial Area",
        phone="+254 711 224 560",
        description=(
            "Rotomoulded water storage tanks for homes, farms and industry. "
            "ISO-certified production with nationwide delivery and a 5-year "
            "warranty on every tank."
        ),
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="sunflow",
        name="SunFlow Irrigation",
        category_slug="energy",
        city="Nakuru",
        county="Nakuru",
        phone="+254 722 981 034",
        description=(
            "Solar-powered irrigation systems engineered for Kenyan "
            "smallholder and commercial farms — pumps, drip kits and "
            "control panels."
        ),
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="nairobisteel",
        name="Nairobi Steel Works",
        category_slug="manufacturing",
        city="Nairobi",
        county="Nairobi",
        address_line="Baba Dogo",
        phone="+254 733 445 210",
        description="Structural steel fabrication, roofing sheets and wire mesh for contractors across East Africa.",
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="greengrow",
        name="GreenGrow Agrovet",
        category_slug="agriculture",
        city="Eldoret",
        county="Uasin Gishu",
        phone="+254 700 112 883",
        description="Certified seed, agrochemicals and farm advisory for smallholder farmers across the Rift Valley.",
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="solaris",
        name="Solaris Power Kenya",
        category_slug="energy",
        city="Kisumu",
        county="Kisumu",
        phone="+254 720 556 907",
        description="Hybrid solar inverters and battery systems for homes and businesses, with installation and after-sales support.",
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="buildright",
        name="BuildRight Hardware",
        category_slug="construction",
        city="Mombasa",
        county="Mombasa",
        phone="+254 741 902 244",
        description="General building materials and hardware supplies for contractors and homeowners on the coast.",
        # Deliberately left pending — demonstrates the pending-verification
        # badge/state in the UI rather than every seeded business being green.
        verification_status=VerificationStatus.PENDING,
    ),
]

PRODUCTS = [
    dict(
        slug="tank5000",
        business_slug="aquatank",
        name="5,000L Vertical Water Tank",
        price=42500,
        specs={
            "Capacity": "5,000 Litres",
            "Material": "Polyethylene (Rotomoulded)",
            "Warranty": "5 Years",
        },
        availability_status=AvailabilityStatus.IN_STOCK,
        availability_note="Nairobi & Nakuru depots",
    ),
    dict(
        slug="tank10000",
        business_slug="aquatank",
        name="10,000L Loft Water Tank",
        price=78000,
        specs={
            "Capacity": "10,000 Litres",
            "Material": "Polyethylene (Rotomoulded)",
            "Warranty": "5 Years",
        },
        availability_status=AvailabilityStatus.MADE_TO_ORDER,
        availability_note="5 days",
    ),
    dict(
        slug="tank1000",
        business_slug="aquatank",
        name="1,000L Slimline Tank",
        price=14200,
        specs={
            "Capacity": "1,000 Litres",
            "Material": "Polyethylene (Rotomoulded)",
            "Warranty": "3 Years",
        },
        availability_status=AvailabilityStatus.IN_STOCK,
        availability_note="Nairobi",
    ),
    dict(
        slug="solarpump",
        business_slug="sunflow",
        name="Solar Water Pump SP-200",
        price=68000,
        specs={"Capacity": "200 L/min", "Power": "1.5kW solar array", "Warranty": "3 Years"},
        availability_status=AvailabilityStatus.MADE_TO_ORDER,
        availability_note="7 days",
    ),
    dict(
        slug="dripkit",
        business_slug="sunflow",
        name="Drip Irrigation Starter Kit (1 Acre)",
        price=24000,
        specs={"Coverage": "1 Acre", "Components": "Pump, filters, driplines, timer", "Warranty": "1 Year"},
        availability_status=AvailabilityStatus.IN_STOCK,
        availability_note="Nakuru",
    ),
    dict(
        slug="steelsheet",
        business_slug="nairobisteel",
        name="Steel Roofing Sheets — Gauge 28",
        price=980,
        specs={"Gauge": "28", "Length": "Cut to order", "Warranty": "10 Years"},
        availability_status=AvailabilityStatus.IN_STOCK,
    ),
    dict(
        slug="maizeseed",
        business_slug="greengrow",
        name="Certified Maize Seed — Hybrid 614",
        price=650,
        specs={"Variety": "H614", "Maturity": "120–140 days", "Pack": "2kg bag"},
        availability_status=AvailabilityStatus.IN_STOCK,
    ),
    dict(
        slug="inverter",
        business_slug="solaris",
        name="5kW Hybrid Solar Inverter",
        price=145000,
        specs={"Output": "5kW", "Battery": "Lithium/Lead-acid compatible", "Warranty": "5 Years"},
        availability_status=AvailabilityStatus.IN_STOCK,
        availability_note="Kisumu & Nairobi",
    ),
]


def seed_demo() -> None:
    db = SessionLocal()
    try:
        owner = db.query(User).filter(User.email == DEMO_OWNER_EMAIL).one_or_none()
        if owner is None:
            owner = User(
                email=DEMO_OWNER_EMAIL,
                full_name="Demo Business Owner",
                hashed_password=hash_password(DEMO_OWNER_PASSWORD),
                role=UserRole.BUSINESS_ADMIN,
                is_active=True,
                is_verified=True,
            )
            db.add(owner)
            db.flush()
            print(f"Created demo owner user ({DEMO_OWNER_EMAIL} / {DEMO_OWNER_PASSWORD}).")

        categories_by_slug = {c.slug: c for c in db.query(Category).all()}

        businesses_by_slug: dict[str, Business] = {}
        biz_created = 0
        for spec in BUSINESSES:
            existing = db.query(Business).filter(Business.slug == spec["slug"]).one_or_none()
            if existing is not None:
                businesses_by_slug[spec["slug"]] = existing
                continue
            biz = Business(
                owner_id=owner.id,
                name=spec["name"],
                slug=spec["slug"],
                description=spec["description"],
                category_id=categories_by_slug[spec["category_slug"]].id,
                county=spec.get("county"),
                city=spec.get("city"),
                address_line=spec.get("address_line"),
                phone=spec.get("phone"),
                verification_status=spec["verification_status"],
            )
            db.add(biz)
            db.flush()
            businesses_by_slug[spec["slug"]] = biz
            biz_created += 1
        db.commit()

        prod_created = 0
        for spec in PRODUCTS:
            existing = db.query(Product).filter(Product.slug == spec["slug"]).one_or_none()
            if existing is not None:
                continue
            business = businesses_by_slug[spec["business_slug"]]
            product = Product(
                business_id=business.id,
                category_id=business.category_id,
                name=spec["name"],
                slug=spec["slug"],
                specs=spec["specs"],
                price_min=spec["price"],
                price_max=spec["price"],
                availability_status=spec["availability_status"],
                availability_note=spec.get("availability_note"),
                county=business.county,
                city=business.city,
                moderation_status=ModerationStatus.APPROVED,
            )
            db.add(product)
            prod_created += 1
        db.commit()

        print(
            f"Seeded {biz_created} new businesses ({len(BUSINESSES) - biz_created} already present), "
            f"{prod_created} new products ({len(PRODUCTS) - prod_created} already present)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo()
