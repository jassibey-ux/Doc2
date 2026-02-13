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

    # Status
    active = Column(Boolean, default=True)
    notes = Column(Text)

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

    # Outcome
    outcome = Column(String(20))  # success, partial, failed, aborted
    note = Column(Text)
    event_metadata = Column(JSONType)  # renamed from 'metadata' which is reserved

    # Relationships
    session = relationship("TestSession", back_populates="events")
    cuas_profile = relationship("CUASProfile", back_populates="test_events")

    __table_args__ = (
        Index("idx_events_session", "session_id"),
        Index("idx_events_type", "type"),
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
