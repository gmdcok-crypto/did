VALID_GROUP_ORIENTATIONS = {"landscape", "portrait"}

ORIENTATION_LAYOUTS = {
    "landscape": {"full", "split_h"},
    "portrait": {"full_portrait", "split_v"},
}


def normalize_group_orientation(value: str | None) -> str:
    orientation = (value or "").strip().lower()
    if orientation not in VALID_GROUP_ORIENTATIONS:
        raise ValueError("orientation must be one of: landscape, portrait")
    return orientation


def normalize_layout_id(value: str | None) -> str:
    layout_id = (value or "full").strip() or "full"
    return layout_id


def is_layout_allowed_for_orientation(layout_id: str | None, orientation: str | None) -> bool:
    normalized_orientation = normalize_group_orientation(orientation)
    normalized_layout_id = normalize_layout_id(layout_id)
    return normalized_layout_id in ORIENTATION_LAYOUTS[normalized_orientation]
