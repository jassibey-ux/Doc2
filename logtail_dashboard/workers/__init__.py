"""
Async Workers for Cloud Deployment

Uses arq (async Redis queue) for background job processing.
Only active when REDIS_URL is configured (cloud mode).
"""
