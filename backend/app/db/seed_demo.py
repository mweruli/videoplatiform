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

from pathlib import Path

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.business import Business, VerificationStatus
from app.models.category import Category
from app.models.product import AvailabilityStatus, ModerationStatus, Product
from app.models.user import User, UserRole
from app.models.video import Video
from app.services.storage import get_storage_backend
from app.services.video import get_video_backend

# Tiny (<10KB) real placeholder clips generated with ffmpeg for local-storage
# playback verification — see docs/decisions.md. Checked into git despite the
# repo-wide `*.mp4` gitignore rule (explicit exception for this directory)
# specifically so a fresh clone/CI run always has something real to upload
# through the video pipeline, not just a DB row pointing at a missing file.
SEED_ASSETS_DIR = Path(__file__).parent / "seed_assets" / "videos"

DEMO_OWNER_EMAIL = "demo-owner@miles.tech"
DEMO_OWNER_PASSWORD = "DemoPass123!"  # noqa: S105 - seed-only, not a real credential

DEMO_ADMIN_EMAIL = "demo-admin@miles.tech"
DEMO_ADMIN_PASSWORD = "DemoAdmin123!"  # noqa: S105 - seed-only, not a real credential

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
        description=(
            "Structural steel fabrication, roofing sheets and wire mesh "
            "for contractors across East Africa."
        ),
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="greengrow",
        name="GreenGrow Agrovet",
        category_slug="agriculture",
        city="Eldoret",
        county="Uasin Gishu",
        phone="+254 700 112 883",
        description=(
            "Certified seed, agrochemicals and farm advisory for "
            "smallholder farmers across the Rift Valley."
        ),
        verification_status=VerificationStatus.VERIFIED,
    ),
    dict(
        slug="solaris",
        name="Solaris Power Kenya",
        category_slug="energy",
        city="Kisumu",
        county="Kisumu",
        phone="+254 720 556 907",
        description=(
            "Hybrid solar inverters and battery systems for homes and "
            "businesses, with installation and after-sales support."
        ),
        verification_status=VerificationStatus.VERIFIED,
        # Matches docs/design/prototype-v1.html's BUSINESSES fixture, where
        # Solaris is the only business with `featured:true` — kept consistent
        # rather than picking a featured business arbitrarily.
        is_featured=True,
    ),
    dict(
        slug="buildright",
        name="BuildRight Hardware",
        category_slug="construction",
        city="Mombasa",
        county="Mombasa",
        phone="+254 741 902 244",
        description=(
            "General building materials and hardware supplies for "
            "contractors and homeowners on the coast."
        ),
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
        # Demonstrates multi-category: a water tank is manufacturing output
        # that also serves the agriculture market (farm water storage).
        extra_category_slugs=["agriculture"],
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
        specs={
            "Coverage": "1 Acre",
            "Components": "Pump, filters, driplines, timer",
            "Warranty": "1 Year",
        },
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
        # The prototype's PRODUCTS fixture has no `featured` field of its own
        # (only BUSINESSES does) — flagging Solaris's flagship product here
        # keeps the demo data consistent with the featured business above
        # rather than picking an unrelated product arbitrarily.
        is_featured=True,
    ),
    dict(
        slug="hardware-starter-kit",
        business_slug="buildright",
        name="Contractor Starter Toolkit",
        price=8500,
        specs={"Pieces": "42", "Case": "Hard-shell carry case"},
        availability_status=AvailabilityStatus.IN_STOCK,
        # Deliberately left pending — gives the admin moderation queue a real
        # product to review, not just the one pending business.
        moderation_status_override="pending",
    ),
]

VIDEOS = [
    dict(
        title="Inside AquaTank: How Our Water Tanks Are Made",
        business_slug="aquatank",
        product_slug="tank5000",
        description=(
            "A look inside AquaTank's Nairobi rotomoulding plant — from raw "
            "polyethylene pellets to finished, ISO-certified water tanks."
        ),
        asset_filename="aquatank_manufacturing.mp4",
        thumbnail_filename="aquatank_manufacturing.jpg",
        # Demonstrates multi-category, same reasoning as the tank5000 product.
        extra_category_slugs=["agriculture"],
    ),
    dict(
        title="Solaris 5kW Hybrid Inverter — Setup & Demo",
        business_slug="solaris",
        product_slug="inverter",
        description=(
            "Solaris Power Kenya walks through installing and powering up "
            "the 5kW hybrid solar inverter for a typical Kisumu household."
        ),
        asset_filename="solaris_inverter_demo.mp4",
        thumbnail_filename="solaris_inverter_demo.jpg",
    ),
    dict(
        title="SunFlow Solar Irrigation in the Field",
        business_slug="sunflow",
        product_slug="solarpump",
        description=(
            "SunFlow's solar water pump running a drip irrigation line on a "
            "Nakuru smallholder farm — no grid power required."
        ),
        asset_filename="sunflow_irrigation.mp4",
        thumbnail_filename="sunflow_irrigation.jpg",
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

        admin = db.query(User).filter(User.email == DEMO_ADMIN_EMAIL).one_or_none()
        if admin is None:
            admin = User(
                email=DEMO_ADMIN_EMAIL,
                full_name="Demo Platform Admin",
                hashed_password=hash_password(DEMO_ADMIN_PASSWORD),
                role=UserRole.PLATFORM_ADMIN,
                is_active=True,
                is_verified=True,
            )
            db.add(admin)
            db.flush()
            print(f"Created demo admin user ({DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}).")

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
                is_featured=spec.get("is_featured", False),
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
            # Product categories default to the owning business's single
            # category, plus whatever `extra_category_slugs` the spec
            # declares (a product/video can carry more than one category —
            # see docs/decisions.md's multi-category note).
            product_categories_list = []
            if business.category is not None:
                product_categories_list.append(business.category)
            for extra_slug in spec.get("extra_category_slugs", []):
                extra_category = categories_by_slug.get(extra_slug)
                if extra_category is not None and extra_category not in product_categories_list:
                    product_categories_list.append(extra_category)

            product = Product(
                business_id=business.id,
                name=spec["name"],
                slug=spec["slug"],
                specs=spec["specs"],
                price_min=spec["price"],
                price_max=spec["price"],
                availability_status=spec["availability_status"],
                availability_note=spec.get("availability_note"),
                county=business.county,
                city=business.city,
                moderation_status=(
                    ModerationStatus.PENDING
                    if spec.get("moderation_status_override") == "pending"
                    else ModerationStatus.APPROVED
                ),
                is_featured=spec.get("is_featured", False),
            )
            product.categories = product_categories_list
            db.add(product)
            prod_created += 1
        db.commit()

        products_by_slug = {p.slug: p for p in db.query(Product).all()}

        video_created = 0
        video_backend = get_video_backend()
        for spec in VIDEOS:
            existing = db.query(Video).filter(Video.title == spec["title"]).one_or_none()
            if existing is not None:
                continue
            asset_path = SEED_ASSETS_DIR / spec["asset_filename"]
            thumb_path = SEED_ASSETS_DIR / spec["thumbnail_filename"]
            if not asset_path.exists():
                print(f"Skipping video '{spec['title']}': seed asset not found at {asset_path}.")
                continue

            business = businesses_by_slug[spec["business_slug"]]
            product = products_by_slug.get(spec["product_slug"])

            # Same category-defaulting logic as products above — see
            # docs/decisions.md's multi-category note.
            video_categories_list = []
            if business.category is not None:
                video_categories_list.append(business.category)
            for extra_slug in spec.get("extra_category_slugs", []):
                extra_category = categories_by_slug.get(extra_slug)
                if extra_category is not None and extra_category not in video_categories_list:
                    video_categories_list.append(extra_category)

            asset = video_backend.upload(
                content=asset_path.read_bytes(),
                filename=asset_path.name,
                content_type="video/mp4",
                folder=f"businesses/{business.id}/videos",
            )
            # The local backend can't extract a thumbnail (no ffmpeg
            # dependency — see app/services/video.py); upload the
            # ffmpeg-extracted seed thumbnail as a plain static asset instead
            # so the demo data still has one, same LocalDiskStorage mechanism
            # product/business images already use.
            thumbnail_url = asset.thumbnail_url
            if thumbnail_url is None and thumb_path.exists():
                thumbnail_url = get_storage_backend().upload(
                    content=thumb_path.read_bytes(),
                    filename=thumb_path.name,
                    content_type="image/jpeg",
                    folder=f"businesses/{business.id}/videos/thumbnails",
                )

            video = Video(
                business_id=business.id,
                product_id=product.id if product else None,
                title=spec["title"],
                description=spec.get("description"),
                video_url=asset.playback_url,
                video_asset_id=asset.asset_id,
                thumbnail_url=thumbnail_url,
                duration_seconds=asset.duration_seconds,
                moderation_status=ModerationStatus.APPROVED,
            )
            video.categories = video_categories_list
            db.add(video)
            video_created += 1
        db.commit()

        biz_skipped = len(BUSINESSES) - biz_created
        prod_skipped = len(PRODUCTS) - prod_created
        video_skipped = len(VIDEOS) - video_created
        print(
            f"Seeded {biz_created} new businesses ({biz_skipped} already present), "
            f"{prod_created} new products ({prod_skipped} already present), "
            f"{video_created} new videos ({video_skipped} already present)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo()
