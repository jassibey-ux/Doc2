"""
SCENSUS CRM Database Module

This module provides SQLite-based data persistence for the Counter-UAS testing platform.
Phase 1 implementation using SQLite with a migration path to PostgreSQL for Phase 2+.
"""

from .connection import DatabaseManager, get_db, init_database, get_db_manager
from .models import (
    Base,
    TestSession,
    Site,
    DroneProfile,
    CUASProfile,
    TrackerAssignment,
    CUASPlacement,
    TrackerTelemetry,
    TestEvent,
    SessionMetrics,
    SessionTag,
    SessionAnnotation,
    AuditLog,
    Engagement,
    EngagementTarget,
    EngagementMetrics,
    SessionActor,
    EngagementJamBurst,
    SDRReading,
    MediaAttachment,
    OperatorPosition,
    WorkspaceLayer,
    TrackerAlias,
)
from .csv_importer import CSVImporter

__all__ = [
    # Connection management
    "DatabaseManager",
    "get_db",
    "get_db_manager",
    "init_database",
    # Models
    "Base",
    "TestSession",
    "Site",
    "DroneProfile",
    "CUASProfile",
    "TrackerAssignment",
    "CUASPlacement",
    "TrackerTelemetry",
    "TestEvent",
    "SessionMetrics",
    "SessionTag",
    "SessionAnnotation",
    "AuditLog",
    "Engagement",
    "EngagementTarget",
    "EngagementMetrics",
    "SessionActor",
    "EngagementJamBurst",
    "SDRReading",
    "MediaAttachment",
    "OperatorPosition",
    "WorkspaceLayer",
    "TrackerAlias",
    # Utilities
    "CSVImporter",
]
