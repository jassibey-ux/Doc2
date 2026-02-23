"""
SQLAlchemy Database Models for SCENSUS CRM

Defines all database tables for the Counter-UAS testing platform.
Designed for SQLite (Phase 1) with PostgreSQL compatibility (Phase 2+).
"""

import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator


# Custom JSON type for SQLite compatibility
class JSONType(TypeDecorator):
    """
    Custom JSON type that works with SQLite.
    Stores JSON as TEXT and deserializes on read.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            return json.loads(value)
        return None


def generate_uuid() -> str:
    """Generate a UUID string for primary keys."""
    return str(uuid4())


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


# ============================================================================
# ENUMS
# ============================================================================

class SessionStatus(str, Enum):
    """Test session status values."""
    PLANNING = "planning"
    ACTIVE = "active"
    CAPTURING = "capturing"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Classification(str, Enum):
    """Data classification levels."""
    UNCLASSIFIED = "UNCLASSIFIED"
    CUI = "CUI"  # Controlled Unclassified Information
    FOUO = "FOUO"  # For Official Use Only


class WeightClass(str, Enum):
    """UAS weight class categories."""
    MICRO = "micro"
    MINI = "mini"
    SMALL = "small"
    MEDIUM = "medium"


class CUASType(str, Enum):
    """Counter-UAS system types."""
    JAMMER = "jammer"
    RF_SENSOR = "rf_sensor"
    RADAR = "radar"
    EO_IR_CAMERA = "eo_ir_camera"
    ACOUSTIC = "acoustic"
    COMBINED = "combined"


class AntennaPattern(str, Enum):
    """Antenna radiation pattern types."""
    OMNI = "omni"
    DIRECTIONAL = "directional"
    SECTOR = "sector"


class AnnotationType(str, Enum):
    """Session annotation types."""
    NOTE = "note"
    OBSERVATION = "observation"
    ISSUE = "issue"
    RECOMMENDATION = "recommendation"


class PassFail(str, Enum):
    """Test result outcome."""
    PASS = "pass"
    FAIL = "fail"
    INCONCLUSIVE = "inconclusive"


class EventOutcome(str, Enum):
    """Test event outcome."""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    ABORTED = "aborted"


class EngagementStatus(str, Enum):
    """Engagement lifecycle status."""
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETE = "complete"
    ABORTED = "aborted"


class EngagementType(str, Enum):
    """Engagement type for analysis context."""
    TEST = "test"
    CONTROL = "control"
    OPERATIONAL = "operational"


class EngagementTargetRole(str, Enum):
    """Role of a drone within an engagement."""
    PRIMARY_TARGET = "primary_target"
    OBSERVER = "observer"


class EmitterType(str, Enum):
    """Type of emitter for an engagement."""
    CUAS_SYSTEM = "cuas_system"
    ACTOR = "actor"


class JamBurstSource(str, Enum):
    """Source of jam burst data."""
    LIVE = "live"
    SD_CARD = "sd_card"
    RECOMPUTED = "recomputed"


# ============================================================================
# USER MODEL (RBAC)
# ============================================================================

class UserRole(str, Enum):
    """User role for RBAC."""
    ADMIN = "admin"
    OPERATOR = "operator"
    OBSERVER = "observer"
    ANALYST = "analyst"


class User(Base):
    """User account for cloud authentication and RBAC."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255))
    role = Column(String(20), nullable=False, default=UserRole.OBSERVER.value)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime)

    def __repr__(self):
        return f"<User(email={self.email}, role={self.role})>"


# ============================================================================
# SITE MODEL
# ============================================================================

class Site(Base):
    """Test site / location model."""

    __tablename__ = "sites"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), index=True)  # Tenant isolation for cloud
    name = Column(String(255), nullable=False)
    description = Column(Text)

    # Geographic data
    boundary_polygon = Column(JSONType)  # GeoJSON polygon
    center_lat = Column(Float, nullable=False)
    center_lon = Column(Float, nullable=False)

    # Site characteristics
    environment_type = Column(String(50))  # open_field, urban, suburban, wooded, coastal, mountain
    elevation_min_m = Column(Float)
    elevation_max_m = Column(Float)

    # Additional info
    rf_notes = Column(Text)
    access_notes = Column(Text)
    markers = Column(JSONType)  # List of named markers with lat/lon
    zones = Column(JSONType)  # List of zones (launch, target, exclusion)

    # Metadata
    classification = Column(String(20), default=Classification.UNCLASSIFIED.value)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 3D / Recon
    recon_status = Column(String(20), default='none')
    recon_captured_at = Column(DateTime, nullable=True)
    camera_state_3d = Column(JSONType, nullable=True)

    # Relationships
    sessions = relationship("TestSession", back_populates="site")

    def __repr__(self):
        return f"<Site(id={self.id}, name={self.name})>"


# ============================================================================
# DRONE PROFILE MODEL
# ============================================================================

class DroneProfile(Base):
    """UAS / Drone profile model."""

    __tablename__ = "drone_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    make = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    serial = Column(String(100))

    # Classification
    weight_class = Column(String(20))  # micro, mini, small, medium

    # Technical specs
    frequency_bands = Column(JSONType)  # List of frequency bands
    expected_failsafe = Column(String(100))  # RTH, land, hover, etc.
    max_speed_mps = Column(Float)
    max_altitude_m = Column(Float)
    endurance_minutes = Column(Float)

    # C2 link characteristics (for J/S modeling)
    c2_protocol = Column(String(50))  # WiFi, Lightbridge, OcuSync, ELRS, LoRa, etc.
    c2_frequency_mhz = Column(Float)  # Command link frequency
    c2_receiver_sensitivity_dbm = Column(Float)  # Receiver sensitivity threshold
    gps_receiver_type = Column(String(50))  # u-blox, integrated, military, etc.
    jam_resistance_category = Column(String(20))  # none, basic, moderate, hardened

    # Additional
    notes = Column(Text)
    image_path = Column(String(500))
    model_3d = Column(String(255), nullable=True)

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tracker_assignments = relationship("TrackerAssignment", back_populates="drone_profile")

    def __repr__(self):
        return f"<DroneProfile(id={self.id}, name={self.name}, make={self.make}, model={self.model})>"


# ============================================================================
# CUAS PROFILE MODEL
# ============================================================================

class CUASProfile(Base):
    """Counter-UAS system profile model."""

    __tablename__ = "cuas_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    vendor = Column(String(100), nullable=False)
    model = Column(String(100))

    # Type and capabilities
    type = Column(String(20))  # jammer, rf_sensor, radar, eo_ir_camera, acoustic, combined
    capabilities = Column(JSONType)  # List of capability strings

    # Performance specs
    effective_range_m = Column(Float)
    measured_range_m = Column(Float)
    beam_width_deg = Column(Float)
    vertical_coverage_deg = Column(Float)

    # Antenna characteristics
    antenna_pattern = Column(String(20))  # omni, directional, sector
    power_output_w = Column(Float)
    antenna_gain_dbi = Column(Float)
    frequency_ranges = Column(JSONType)  # List of frequency range objects

    # RF engineering parameters (for propagation modeling)
    eirp_dbm = Column(Float)  # Effective Isotropic Radiated Power
    min_js_ratio_db = Column(Float)  # Jammer-to-Signal ratio needed for effect
    polarization = Column(String(20))  # RHCP, LHCP, linear, horizontal, vertical
    model_3d = Column(String(255), nullable=True)

    # Additional
    notes = Column(Text)
    classification = Column(String(20), default=Classification.UNCLASSIFIED.value)

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    placements = relationship("CUASPlacement", back_populates="cuas_profile")
    test_events = relationship("TestEvent", back_populates="cuas_profile")

    def __repr__(self):
        return f"<CUASProfile(id={self.id}, name={self.name}, vendor={self.vendor})>"


# ============================================================================
# TEST SESSION MODEL
# ============================================================================

class TestSession(Base):
    """Main test session model - the primary CRM entity."""

    __tablename__ = "test_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    organization_id = Column(String(36), index=True)  # Tenant isolation for cloud
    name = Column(String(255), nullable=False)

    # Foreign keys
    site_id = Column(String(36), ForeignKey("sites.id"))

    # Status and timing
    status = Column(String(20), default=SessionStatus.PLANNING.value)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    duration_seconds = Column(Float)

    # Operator info
    operator_name = Column(String(255))
    weather_notes = Column(Text)
    post_test_notes = Column(Text)

    # Metrics stored as JSON for flexibility
    metrics = Column(JSONType)

    # File system reference (for backward compatibility)
    live_data_path = Column(String(500))

    # Metadata
    classification = Column(String(20), default=Classification.UNCLASSIFIED.value)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    site = relationship("Site", back_populates="sessions")
    tracker_assignments = relationship("TrackerAssignment", back_populates="session", cascade="all, delete-orphan")
    cuas_placements = relationship("CUASPlacement", back_populates="session", cascade="all, delete-orphan")
    telemetry = relationship("TrackerTelemetry", back_populates="session", cascade="all, delete-orphan")
    events = relationship("TestEvent", back_populates="session", cascade="all, delete-orphan")
    session_metrics = relationship("SessionMetrics", back_populates="session", uselist=False, cascade="all, delete-orphan")
    tags = relationship("SessionTag", back_populates="session", cascade="all, delete-orphan")
    annotations = relationship("SessionAnnotation", back_populates="session", cascade="all, delete-orphan")
    engagements = relationship("Engagement", back_populates="session", cascade="all, delete-orphan")
    session_actors = relationship("SessionActor", back_populates="session", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_sessions_site", "site_id"),
        Index("idx_sessions_status", "status"),
        Index("idx_sessions_start_time", "start_time"),
    )

    def __repr__(self):
        return f"<TestSession(id={self.id}, name={self.name}, status={self.status})>"


# ============================================================================
# JUNCTION TABLES
# ============================================================================

class TrackerAssignment(Base):
    """Links trackers (drones) to test sessions."""

    __tablename__ = "tracker_assignments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    tracker_id = Column(String(100), nullable=False)  # The tracker ID from the data
    drone_profile_id = Column(String(36), ForeignKey("drone_profiles.id"))

    session_color = Column(String(20))  # Color assigned for this tracker in the session UI
    target_altitude_m = Column(Float)  # Target altitude for this tracker
    model_3d_override = Column(String(255), nullable=True)  # Override 3D model for this assignment

    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("TestSession", back_populates="tracker_assignments")
    drone_profile = relationship("DroneProfile", back_populates="tracker_assignments")

    __table_args__ = (
        Index("idx_assignments_session", "session_id"),
        Index("idx_assignments_drone", "drone_profile_id"),
        UniqueConstraint("session_id", "tracker_id", name="uq_session_tracker"),
    )

    def __repr__(self):
        return f"<TrackerAssignment(session={self.session_id}, tracker={self.tracker_id})>"


class CUASPlacement(Base):
    """Links CUAS systems to test sessions with placement info."""

    __tablename__ = "cuas_placements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    cuas_profile_id = Column(String(36), ForeignKey("cuas_profiles.id"))

    # Position
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    alt_m = Column(Float)
    height_agl_m = Column(Float)

    # Orientation
    orientation_deg = Column(Float)  # Azimuth
    elevation_deg = Column(Float)  # Tilt angle
    heading_deg = Column(Float)  # Heading direction

    # Status
    active = Column(Boolean, default=True)
    model_3d_override = Column(String(255), nullable=True)  # Override 3D model for this placement
    notes = Column(Text)

    # Geotagging (populated from mobile companion or field visit)
    geotagged_at = Column(DateTime)
    geotagged_by_actor_id = Column(String(36), ForeignKey("session_actors.id"))
    photo_url = Column(String(500))
    gps_accuracy_m = Column(Float)
    geotag_method = Column(String(20))  # gps, manual, photo, cot

    # Relationships
    session = relationship("TestSession", back_populates="cuas_placements")
    cuas_profile = relationship("CUASProfile", back_populates="placements")

    __table_args__ = (
        Index("idx_placements_session", "session_id"),
        Index("idx_placements_cuas", "cuas_profile_id"),
    )

    def __repr__(self):
        return f"<CUASPlacement(session={self.session_id}, cuas={self.cuas_profile_id})>"


# ============================================================================
# TELEMETRY MODEL
# ============================================================================

class TrackerTelemetry(Base):
    """Time-series telemetry data for trackers."""

    __tablename__ = "tracker_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    tracker_id = Column(String(100), nullable=False)

    # Timestamp
    time_local_received = Column(DateTime, nullable=False)

    # Position
    lat = Column(Float)
    lon = Column(Float)
    alt_m = Column(Float)

    # Motion
    speed_mps = Column(Float)
    course_deg = Column(Float)

    # Signal quality
    rssi_dbm = Column(Float)
    satellites = Column(Integer)
    fix_valid = Column(Boolean)
    hdop = Column(Float)

    # Additional
    battery_mv = Column(Float)
    baro_alt_m = Column(Float)  # Barometric altitude (if available)
    time_gps = Column(DateTime)  # GPS-reported timestamp (vs local receive time)

    # Relationships
    session = relationship("TestSession", back_populates="telemetry")

    __table_args__ = (
        Index("idx_telemetry_session_tracker_time", "session_id", "tracker_id", "time_local_received"),
        Index("idx_telemetry_session", "session_id"),
    )

    def __repr__(self):
        return f"<TrackerTelemetry(session={self.session_id}, tracker={self.tracker_id}, time={self.time_local_received})>"


# ============================================================================
# TEST EVENTS MODEL
# ============================================================================

class TestEvent(Base):
    """Test events and milestones during a session."""

    __tablename__ = "test_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)

    # Event info
    type = Column(String(100), nullable=False)  # e.g., "jammer_activated", "failsafe_triggered"
    timestamp = Column(DateTime, nullable=False)
    source = Column(String(50), default="manual")  # manual, automatic, system

    # References
    cuas_id = Column(String(36), ForeignKey("cuas_profiles.id"))
    tracker_id = Column(String(100))
    drone_profile_id = Column(String(36), ForeignKey("drone_profiles.id"))
    engagement_id = Column(String(36), ForeignKey("engagements.id"), nullable=True)
    burst_id = Column(String(36), ForeignKey("engagement_jam_bursts.id"), nullable=True)

    # Client-reported timestamp (created_at/timestamp is authoritative)
    client_timestamp = Column(DateTime)

    # Outcome
    outcome = Column(String(20))  # success, partial, failed, aborted
    note = Column(Text)
    event_metadata = Column(JSONType)  # renamed from 'metadata' which is reserved

    # Relationships
    session = relationship("TestSession", back_populates="events")
    cuas_profile = relationship("CUASProfile", back_populates="test_events")
    engagement = relationship("Engagement", back_populates="events")
    burst = relationship("EngagementJamBurst", back_populates="events")

    __table_args__ = (
        Index("idx_events_session", "session_id"),
        Index("idx_events_type", "type"),
        Index("idx_events_engagement", "engagement_id"),
    )

    def __repr__(self):
        return f"<TestEvent(session={self.session_id}, type={self.type}, timestamp={self.timestamp})>"


# ============================================================================
# SESSION METRICS MODEL
# ============================================================================

class SessionMetrics(Base):
    """Computed metrics for a test session."""

    __tablename__ = "session_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), unique=True, nullable=False)

    # Core metrics
    time_to_effect_s = Column(Float)
    time_to_full_denial_s = Column(Float)
    effective_range_m = Column(Float)
    max_lateral_drift_m = Column(Float)
    max_vertical_drift_m = Column(Float)
    total_flight_time_s = Column(Float)
    time_under_jamming_s = Column(Float)
    recovery_time_s = Column(Float)

    # Scoring
    overall_score = Column(Float)
    pass_fail = Column(String(20))  # pass, fail, inconclusive

    # Comparison to expected
    met_expectations = Column(Boolean)
    deviation_notes = Column(Text)

    # Analysis metadata
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    analyzed_by = Column(String(255))
    analysis_version = Column(String(50))

    # Relationships
    session = relationship("TestSession", back_populates="session_metrics")

    def __repr__(self):
        return f"<SessionMetrics(session={self.session_id}, pass_fail={self.pass_fail})>"


# ============================================================================
# TAGGING SYSTEM
# ============================================================================

class SessionTag(Base):
    """Tags for categorizing sessions."""

    __tablename__ = "session_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    tag = Column(String(100), nullable=False)

    # Relationships
    session = relationship("TestSession", back_populates="tags")

    __table_args__ = (
        UniqueConstraint("session_id", "tag", name="uq_session_tag"),
        Index("idx_tags_session", "session_id"),
        Index("idx_tags_tag", "tag"),
    )

    def __repr__(self):
        return f"<SessionTag(session={self.session_id}, tag={self.tag})>"


# ============================================================================
# ANNOTATION SYSTEM
# ============================================================================

class SessionAnnotation(Base):
    """Annotations and notes for sessions."""

    __tablename__ = "session_annotations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)

    # Content
    content = Column(Text, nullable=False)
    annotation_type = Column(String(20), default=AnnotationType.NOTE.value)

    # Optional timestamp reference (link annotation to point in session timeline)
    timestamp_ref = Column(DateTime)

    # Metadata
    author = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("TestSession", back_populates="annotations")

    __table_args__ = (
        Index("idx_annotations_session", "session_id"),
    )

    def __repr__(self):
        return f"<SessionAnnotation(session={self.session_id}, type={self.annotation_type})>"


# ============================================================================
# ENGAGEMENT MODELS
# ============================================================================

class Engagement(Base):
    """Links one CUAS placement or session actor to target drones for a specific test run."""

    __tablename__ = "engagements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    cuas_placement_id = Column(String(36), ForeignKey("cuas_placements.id"), nullable=True)  # nullable for backward compat

    # Emitter polymorphism: 'cuas_system' | 'actor'
    emitter_type = Column(String(20), nullable=False, default=EmitterType.CUAS_SYSTEM.value)
    emitter_id = Column(String(36), nullable=False, default="")  # FK to cuas_placements OR session_actors

    # Identification
    name = Column(String(255))
    run_number = Column(Integer)  # Auto-incremented per session (1, 2, 3...)
    engagement_type = Column(String(20), default=EngagementType.TEST.value)  # test, control, operational
    status = Column(String(20), default=EngagementStatus.PLANNED.value)  # planned, active, complete, aborted

    # Timing
    engage_timestamp = Column(DateTime)
    disengage_timestamp = Column(DateTime)

    # CUAS position snapshot at engage time
    cuas_lat = Column(Float)
    cuas_lon = Column(Float)
    cuas_alt_m = Column(Float)
    cuas_orientation_deg = Column(Float)

    # Merged jam fields (from EngagementJamBurst — since always 1:1)
    jam_on_at = Column(DateTime)
    jam_off_at = Column(DateTime)
    jam_duration_s = Column(Float)
    jam_frequency_mhz = Column(Float)
    jam_power_dbm = Column(Float)
    jam_bandwidth_mhz = Column(Float)
    gps_denial_detected = Column(Boolean, default=False)
    denial_onset_at = Column(DateTime)
    time_to_effect_s = Column(Float)

    # Metadata
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("TestSession", back_populates="engagements")
    cuas_placement = relationship("CUASPlacement")
    targets = relationship("EngagementTarget", back_populates="engagement", cascade="all, delete-orphan")
    metrics = relationship("EngagementMetrics", back_populates="engagement", uselist=False, cascade="all, delete-orphan")
    events = relationship("TestEvent", back_populates="engagement")
    bursts = relationship("EngagementJamBurst", back_populates="engagement", cascade="all, delete-orphan", order_by="EngagementJamBurst.burst_seq")

    __table_args__ = (
        Index("idx_engagements_session", "session_id"),
        Index("idx_engagements_status", "status"),
        Index("idx_engagements_cuas_placement", "cuas_placement_id"),
        Index("idx_engagements_emitter", "emitter_type", "emitter_id"),
    )

    def __repr__(self):
        return f"<Engagement(id={self.id}, session={self.session_id}, status={self.status})>"


class EngagementTarget(Base):
    """Per-drone snapshot within an engagement."""

    __tablename__ = "engagement_targets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.id"), nullable=False)
    tracker_id = Column(String(100), nullable=False)
    drone_profile_id = Column(String(36), ForeignKey("drone_profiles.id"))
    role = Column(String(20), default=EngagementTargetRole.PRIMARY_TARGET.value)

    # Initial geometry snapshot (computed at ENGAGE)
    initial_range_m = Column(Float)
    initial_bearing_deg = Column(Float)
    angle_off_boresight_deg = Column(Float)
    initial_altitude_m = Column(Float)
    drone_lat = Column(Float)
    drone_lon = Column(Float)

    # Final geometry (computed at DISENGAGE)
    final_range_m = Column(Float)
    final_bearing_deg = Column(Float)

    # Relationships
    engagement = relationship("Engagement", back_populates="targets")
    drone_profile = relationship("DroneProfile")

    __table_args__ = (
        Index("idx_engagement_targets_engagement", "engagement_id"),
    )

    def __repr__(self):
        return f"<EngagementTarget(engagement={self.engagement_id}, tracker={self.tracker_id})>"


class EngagementMetrics(Base):
    """Computed metrics for an engagement (1:1 with Engagement)."""

    __tablename__ = "engagement_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.id"), unique=True, nullable=False)

    # Core timing metrics
    time_to_effect_s = Column(Float)
    time_to_full_denial_s = Column(Float)
    denial_duration_s = Column(Float)
    denial_consistency_pct = Column(Float)
    recovery_time_s = Column(Float)

    # Range & bearing
    effective_range_m = Column(Float)
    denial_bearing_deg = Column(Float)
    denial_angle_off_boresight_deg = Column(Float)
    min_range_m = Column(Float)
    recovery_range_m = Column(Float)

    # Drift
    max_drift_m = Column(Float)
    max_lateral_drift_m = Column(Float)
    max_vertical_drift_m = Column(Float)
    altitude_change_m = Column(Float)

    # Failsafe
    failsafe_triggered = Column(Boolean, default=False)
    failsafe_type = Column(String(50))

    # Scoring
    pass_fail = Column(String(20))  # pass, fail, inconclusive
    overall_score = Column(Float)

    # Data source
    data_source = Column(String(20), default="live_only")  # live_only, sd_merged
    metrics_json = Column(JSONType)  # Per-target breakdown + extended metrics
    analyzed_at = Column(DateTime, default=datetime.utcnow)

    # Enhanced metrics (burst-aware)
    anchor_type = Column(String(20), default="first_jam_on")
    anchor_timestamp = Column(DateTime)
    denial_onset_timestamp = Column(DateTime)
    denial_angle_off_boresight_deg_v2 = Column(Float)  # Refined denial angle
    reacquisition_time_s = Column(Float)
    telemetry_loss_duration_s = Column(Float)
    per_burst_json = Column(JSONType)  # Metrics broken down by burst
    computation_version = Column(String(50), default="2.0")
    job_id = Column(String(100))  # Worker job ID for traceability

    # Relationships
    engagement = relationship("Engagement", back_populates="metrics")

    def __repr__(self):
        return f"<EngagementMetrics(engagement={self.engagement_id}, pass_fail={self.pass_fail})>"


# ============================================================================
# SESSION ACTOR MODEL
# ============================================================================

class SessionActor(Base):
    """Mobile emitter actor within a session (e.g., handheld jammer operator)."""

    __tablename__ = "session_actors"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    name = Column(String(255), nullable=False)
    callsign = Column(String(50))
    cot_uid = Column(String(100), unique=True)  # Cursor-on-Target UID for CoT listener mapping

    # Position (manual or tracker-derived)
    lat = Column(Float)
    lon = Column(Float)
    heading_deg = Column(Float)

    # Optional linked tracker for auto-position
    tracker_unit_id = Column(String(100))

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("TestSession", back_populates="session_actors")

    __table_args__ = (
        Index("idx_actors_session", "session_id"),
    )

    def __repr__(self):
        return f"<SessionActor(id={self.id}, name={self.name}, session={self.session_id})>"


# ============================================================================
# ENGAGEMENT JAM BURST MODEL
# ============================================================================

class EngagementJamBurst(Base):
    """Discrete jam burst within an engagement (jam-on to jam-off window)."""

    __tablename__ = "engagement_jam_bursts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    engagement_id = Column(String(36), ForeignKey("engagements.id", ondelete="CASCADE"), nullable=False)
    burst_seq = Column(Integer, nullable=False)

    # Timing
    jam_on_at = Column(DateTime, nullable=False)
    jam_off_at = Column(DateTime)
    duration_s = Column(Float)

    # Emitter snapshot at jam_on
    emitter_lat = Column(Float)
    emitter_lon = Column(Float)
    emitter_heading_deg = Column(Float)

    # Jam signal parameters
    frequency_mhz = Column(Float)       # Primary jam frequency in MHz
    power_dbm = Column(Float)           # Transmit power in dBm
    bandwidth_mhz = Column(Float)       # Jam signal bandwidth in MHz

    # Per-target snapshots as JSON
    # [{tracker_id, lat, lon, range_m, bearing_deg, gps_status}]
    target_snapshots = Column(JSONType)

    # Denial detection (populated by worker or inline)
    gps_denial_detected = Column(Boolean, default=False)
    denial_onset_at = Column(DateTime)
    time_to_effect_s = Column(Float)

    # Metadata
    notes = Column(Text)
    source = Column(String(20), default=JamBurstSource.LIVE.value)  # live, sd_card, recomputed
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    engagement = relationship("Engagement", back_populates="bursts")
    events = relationship("TestEvent", back_populates="burst")

    __table_args__ = (
        UniqueConstraint("engagement_id", "burst_seq", name="uq_engagement_burst_seq"),
        Index("idx_bursts_engagement", "engagement_id"),
        Index("idx_bursts_time", "jam_on_at"),
    )

    def __repr__(self):
        return f"<EngagementJamBurst(engagement={self.engagement_id}, seq={self.burst_seq})>"


# ============================================================================
# SDR READINGS MODEL
# ============================================================================

class SDRReading(Base):
    """Spectrum data from HackRF or other SDR devices captured in the field."""

    __tablename__ = "sdr_readings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    actor_id = Column(String(36), ForeignKey("session_actors.id"))
    timestamp = Column(DateTime, nullable=False)

    # Position at capture time
    lat = Column(Float)
    lon = Column(Float)
    alt_m = Column(Float)
    gps_accuracy_m = Column(Float)

    # SDR configuration
    center_frequency_mhz = Column(Float, nullable=False)
    bandwidth_mhz = Column(Float)
    sample_rate_mhz = Column(Float)
    gain_db = Column(Float)

    # Readings data: [{frequency_mhz, power_dbm}]
    readings = Column(JSONType)
    device_info = Column(JSONType)  # {device, serial, firmware}
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("TestSession")

    __table_args__ = (
        Index("idx_sdr_session", "session_id"),
        Index("idx_sdr_timestamp", "timestamp"),
        Index("idx_sdr_frequency", "center_frequency_mhz"),
    )

    def __repr__(self):
        return f"<SDRReading(session={self.session_id}, freq={self.center_frequency_mhz}MHz)>"


# ============================================================================
# MEDIA ATTACHMENTS MODEL
# ============================================================================

class MediaAttachment(Base):
    """Photos, files, and media attached to sessions or entities."""

    __tablename__ = "media_attachments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"))
    site_id = Column(String(36), ForeignKey("sites.id"))

    # Polymorphic entity reference (e.g., cuas_placement, engagement)
    entity_type = Column(String(50))
    entity_id = Column(String(36))

    # File info
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100))
    file_size_bytes = Column(Integer)
    thumbnail_path = Column(String(500))

    # Content metadata
    caption = Column(Text)
    lat = Column(Float)
    lon = Column(Float)
    taken_at = Column(DateTime)

    # Provenance
    uploaded_by = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("TestSession")

    __table_args__ = (
        Index("idx_media_session", "session_id"),
        Index("idx_media_entity", "entity_type", "entity_id"),
    )

    def __repr__(self):
        return f"<MediaAttachment(id={self.id}, file={self.file_name})>"


# ============================================================================
# OPERATOR POSITIONS MODEL
# ============================================================================

class OperatorPosition(Base):
    """Time-series position data for field operators (from GPS, CoT, or manual entry)."""

    __tablename__ = "operator_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("test_sessions.id"), nullable=False)
    actor_id = Column(String(36), ForeignKey("session_actors.id"), nullable=False)

    # Position
    timestamp = Column(DateTime, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    alt_m = Column(Float)
    heading_deg = Column(Float)
    speed_mps = Column(Float)
    gps_accuracy_m = Column(Float)

    # Source
    source = Column(String(20), default="gps")  # gps, cot, manual

    __table_args__ = (
        Index("idx_oppos_session_actor_time", "session_id", "actor_id", "timestamp"),
        Index("idx_oppos_session", "session_id"),
    )

    def __repr__(self):
        return f"<OperatorPosition(actor={self.actor_id}, time={self.timestamp})>"


# ============================================================================
# WORKSPACE LAYERS MODEL
# ============================================================================

class WorkspaceLayer(Base):
    """User-imported or generated map layers (GeoJSON, KML, annotations)."""

    __tablename__ = "workspace_layers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("test_sessions.id"))
    site_id = Column(String(36), ForeignKey("sites.id"))

    # Layer info
    name = Column(String(255), nullable=False)
    layer_type = Column(String(20), nullable=False)  # geojson, kml, annotation, reference
    geojson_data = Column(JSONType)
    style = Column(JSONType)  # {color, opacity, lineWidth, fillColor, ...}

    # Display
    visible = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_layers_session", "session_id"),
        Index("idx_layers_site", "site_id"),
    )

    def __repr__(self):
        return f"<WorkspaceLayer(id={self.id}, name={self.name}, type={self.layer_type})>"


# ============================================================================
# TRACKER ALIASES MODEL
# ============================================================================

class TrackerAlias(Base):
    """Persistent tracker ID aliases (replaces Express JSON file)."""

    __tablename__ = "tracker_aliases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tracker_id = Column(String(100), nullable=False, unique=True, index=True)
    alias = Column(String(255), nullable=False)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<TrackerAlias(tracker={self.tracker_id}, alias={self.alias})>"


# ============================================================================
# AUDIT LOG
# ============================================================================

class AuditLog(Base):
    """Audit trail for all data modifications."""

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Who performed the action
    user_id = Column(String(255))
    user_name = Column(String(255))

    # What was done
    action = Column(String(50), nullable=False)  # create, update, delete, export, view
    entity_type = Column(String(50), nullable=False)  # session, site, drone_profile, etc.
    entity_id = Column(String(36), nullable=False)

    # Change details
    changes = Column(JSONType)  # {field: {old: x, new: y}}
    classification_accessed = Column(String(20))

    __table_args__ = (
        Index("idx_audit_timestamp", "timestamp"),
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_user", "user_id"),
    )

    def __repr__(self):
        return f"<AuditLog(action={self.action}, entity={self.entity_type}:{self.entity_id})>"
