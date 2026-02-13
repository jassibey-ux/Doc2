"""
Database Migrations Module

Provides schema versioning and migration support for the CRM database.
"""

from .manager import MigrationManager, Migration

__all__ = ["MigrationManager", "Migration"]
