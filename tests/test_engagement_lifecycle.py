"""Tests for engagement state machine transitions."""

import pytest
from datetime import datetime
from logtail_dashboard.database.models import (
    Engagement, EngagementStatus, EngagementType, EmitterType,
    generate_uuid,
)


class TestEngagementStateMachine:
    """Test engagement status transitions."""

    def _make_engagement(self, status=EngagementStatus.PLANNED.value):
        eng = Engagement()
        eng.id = generate_uuid()
        eng.session_id = generate_uuid()
        eng.cuas_placement_id = generate_uuid()
        eng.emitter_type = EmitterType.CUAS_SYSTEM.value
        eng.emitter_id = eng.cuas_placement_id
        eng.status = status
        eng.engagement_type = EngagementType.TEST.value
        eng.targets = []
        eng.bursts = []
        return eng

    def test_initial_status_is_planned(self):
        """New engagement should start in planned status."""
        eng = self._make_engagement()
        assert eng.status == EngagementStatus.PLANNED.value

    def test_planned_to_active(self):
        """Planned engagement can transition to active."""
        eng = self._make_engagement()
        assert eng.status == EngagementStatus.PLANNED.value

        eng.status = EngagementStatus.ACTIVE.value
        eng.engage_timestamp = datetime.utcnow()
        assert eng.status == EngagementStatus.ACTIVE.value
        assert eng.engage_timestamp is not None

    def test_active_to_complete(self):
        """Active engagement can transition to complete."""
        eng = self._make_engagement(EngagementStatus.ACTIVE.value)
        eng.engage_timestamp = datetime.utcnow()

        eng.status = EngagementStatus.COMPLETE.value
        eng.disengage_timestamp = datetime.utcnow()
        assert eng.status == EngagementStatus.COMPLETE.value
        assert eng.disengage_timestamp is not None

    def test_active_to_aborted(self):
        """Active engagement can transition to aborted."""
        eng = self._make_engagement(EngagementStatus.ACTIVE.value)
        eng.engage_timestamp = datetime.utcnow()

        eng.status = EngagementStatus.ABORTED.value
        eng.disengage_timestamp = datetime.utcnow()
        assert eng.status == EngagementStatus.ABORTED.value

    def test_emitter_polymorphism_cuas(self):
        """CUAS system emitter type should have cuas_placement_id set."""
        eng = self._make_engagement()
        assert eng.emitter_type == EmitterType.CUAS_SYSTEM.value
        assert eng.emitter_id == eng.cuas_placement_id
        assert eng.cuas_placement_id is not None

    def test_emitter_polymorphism_actor(self):
        """Actor emitter type should have emitter_id set, cuas_placement_id can be None."""
        eng = self._make_engagement()
        eng.emitter_type = EmitterType.ACTOR.value
        actor_id = generate_uuid()
        eng.emitter_id = actor_id
        eng.cuas_placement_id = None

        assert eng.emitter_type == EmitterType.ACTOR.value
        assert eng.emitter_id == actor_id
        assert eng.cuas_placement_id is None

    def test_engagement_type_values(self):
        """Engagement types should have correct string values."""
        assert EngagementType.TEST.value == "test"
        assert EngagementType.CONTROL.value == "control"
        assert EngagementType.OPERATIONAL.value == "operational"

    def test_engagement_status_values(self):
        """Engagement statuses should have correct string values."""
        assert EngagementStatus.PLANNED.value == "planned"
        assert EngagementStatus.ACTIVE.value == "active"
        assert EngagementStatus.COMPLETE.value == "complete"
        assert EngagementStatus.ABORTED.value == "aborted"

    def test_emitter_type_values(self):
        """Emitter types should have correct string values."""
        assert EmitterType.CUAS_SYSTEM.value == "cuas_system"
        assert EmitterType.ACTOR.value == "actor"


class TestEngagementInvalidTransitions:
    """Test that invalid transitions are guarded at API level.

    The model itself doesn't enforce transitions (that's the API's job),
    but these tests document the expected valid paths.
    """

    VALID_TRANSITIONS = {
        "planned": ["active"],
        "active": ["complete", "aborted"],
        "complete": [],  # Terminal
        "aborted": [],   # Terminal
    }

    def test_valid_transitions_documented(self):
        """Verify valid transition map is complete."""
        for status in EngagementStatus:
            assert status.value in self.VALID_TRANSITIONS

    def test_terminal_states_have_no_transitions(self):
        """Complete and aborted are terminal states."""
        assert self.VALID_TRANSITIONS["complete"] == []
        assert self.VALID_TRANSITIONS["aborted"] == []

    def test_planned_can_only_go_to_active(self):
        """Planned can only transition to active."""
        assert self.VALID_TRANSITIONS["planned"] == ["active"]

    def test_active_can_go_to_complete_or_aborted(self):
        """Active can transition to complete or aborted."""
        assert "complete" in self.VALID_TRANSITIONS["active"]
        assert "aborted" in self.VALID_TRANSITIONS["active"]
