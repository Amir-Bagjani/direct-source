import uuid

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from marketplace.accounts.models import PlatformRole, User


@pytest.fixture(autouse=True)
def clear_throttles():
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user_factory(db):
    def create(role=None, **kwargs):
        kwargs.setdefault("mobile", "+989" + str(uuid.uuid4().int % 10**9).zfill(9))
        kwargs.setdefault("first_name", "نام")
        kwargs.setdefault("last_name", "خانوادگی")
        user = User.objects.create_user(password="A-long-secret-947!", **kwargs)
        if role:
            PlatformRole.objects.create(user=user, role=role)
        return user

    return create


@pytest.fixture
def business_data():
    return {
        "name": "کارگاه",
        "kind": "manufacturer",
        "phone": "02112345678",
        "description": "تولید کیف",
        "address": {"province": "تهران", "city": "تهران", "address": "نشانی خصوصی"},
    }
