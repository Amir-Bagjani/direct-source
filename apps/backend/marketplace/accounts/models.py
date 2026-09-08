import re

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from marketplace.common.models import BaseModel


def normalize_mobile(value):
    value = (
        str(value).strip().translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    )
    if value.startswith("09"):
        value = "+98" + value[1:]
    if not re.fullmatch(r"\+989[0-9]{9}", value):
        raise ValidationError({"mobile": "شمارهٔ موبایل معتبر وارد کنید."})
    return value


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(self, mobile, password=None, **extra_fields):
        extra_fields["email"] = extra_fields.get("email", "").strip().lower()
        user = self.model(mobile=normalize_mobile(mobile), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, mobile, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("Superuser requires is_staff and is_superuser.")
        # Technical superuser is deliberately not a platform owner.
        return self.create_user(mobile, password, **extra_fields)


class User(AbstractUser, BaseModel):
    username = None  # type: ignore[assignment]
    mobile = models.CharField(max_length=13, unique=True)
    email = models.EmailField(blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    is_suspended = models.BooleanField(default=False)
    terms_version = models.CharField(max_length=40, blank=True)
    privacy_version = models.CharField(max_length=40, blank=True)
    consented_at = models.DateTimeField(null=True)
    USERNAME_FIELD = "mobile"
    REQUIRED_FIELDS = ["first_name", "last_name"]
    objects = UserManager()  # type: ignore[assignment, misc]

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("email"), condition=~Q(email=""), name="user_email_ci_unique"
            ),
            models.CheckConstraint(
                condition=Q(mobile__regex=r"^\+989[0-9]{9}$"), name="user_mobile_canonical"
            ),
        ]


class PlatformRole(BaseModel):
    class Role(models.TextChoices):
        OWNER = "owner", "مالک سامانه"
        OPERATOR = "operator", "اپراتور"

    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="platform_roles")
    role = models.CharField(max_length=16, choices=Role.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="platform_role_unique"),
            models.CheckConstraint(
                condition=Q(role__in=["owner", "operator"]), name="platform_role_valid"
            ),
        ]


class AuthSession(BaseModel):
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="auth_sessions")
    current_jti = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)


class EmailChallenge(BaseModel):
    user = models.ForeignKey(User, on_delete=models.PROTECT)
    purpose = models.CharField(max_length=8, choices=[("verify", "Verify"), ("reset", "Reset")])
    token_digest = models.CharField(max_length=64, unique=True)
    email = models.EmailField()
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True)


class Business(BaseModel):
    class Kind(models.TextChoices):
        MANUFACTURER = "manufacturer", "تولیدکننده"
        RETAILER = "retailer", "خرده‌فروش"

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PENDING = "pending", "در انتظار تأیید"
        CHANGES = "changes_requested", "نیازمند اصلاح"
        VERIFIED = "verified", "تأییدشده"
        REJECTED = "rejected", "ردشده"
        SUSPENDED = "suspended", "تعلیق‌شده"

    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    phone = models.CharField(max_length=24)
    description = models.CharField(max_length=2000)
    controlled_access = models.BooleanField(default=False)
    first_verified_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(kind__in=["manufacturer", "retailer"]), name="business_kind_valid"
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "draft",
                        "pending",
                        "changes_requested",
                        "verified",
                        "rejected",
                        "suspended",
                    ]
                ),
                name="business_status_valid",
            ),
        ]
        indexes = [models.Index(fields=["status", "created_at"])]


class Membership(BaseModel):
    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="membership")
    business = models.OneToOneField(Business, on_delete=models.PROTECT, related_name="membership")
    role = models.CharField(max_length=16, default="owner", choices=[("owner", "مالک")])

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(role="owner"), name="membership_owner_only")
        ]


class Address(BaseModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT, related_name="addresses")
    province = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    address = models.CharField(max_length=1000)


class VerificationApplication(BaseModel):
    business = models.OneToOneField(Business, on_delete=models.PROTECT, related_name="verification")
    assigned_to = models.ForeignKey(User, null=True, on_delete=models.PROTECT)
    submitted_at = models.DateTimeField(null=True)


class VerificationSection(BaseModel):
    application = models.ForeignKey(
        VerificationApplication, on_delete=models.PROTECT, related_name="sections"
    )
    kind = models.CharField(max_length=8, choices=[("identity", "هویت"), ("activity", "فعالیت")])
    status = models.CharField(
        max_length=20,
        default="draft",
        choices=[(x, x) for x in ["draft", "pending", "approved", "changes_requested", "rejected"]],
    )
    data = models.JSONField(default=dict)
    reason = models.CharField(max_length=2000, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["application", "kind"], name="verification_section_unique"
            ),
            models.CheckConstraint(
                condition=Q(kind__in=["identity", "activity"]), name="verification_kind_valid"
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=["draft", "pending", "approved", "changes_requested", "rejected"]
                ),
                name="verification_status_valid",
            ),
        ]


class BusinessRevision(BaseModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT, related_name="revisions")
    assigned_to = models.ForeignKey(User, null=True, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, default="pending")
    identity_status = models.CharField(max_length=20)
    activity_status = models.CharField(max_length=20)
    identity_reason = models.CharField(max_length=2000, blank=True)
    activity_reason = models.CharField(max_length=2000, blank=True)
    before = models.JSONField()
    proposed = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["business"],
                condition=Q(status__in=["pending", "changes_requested"]),
                name="one_open_business_revision",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["pending", "changes_requested", "approved", "rejected"]),
                name="business_revision_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(
                    identity_status__in=["pending", "changes_requested", "approved", "rejected"]
                ),
                name="revision_identity_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(
                    activity_status__in=["pending", "changes_requested", "approved", "rejected"]
                ),
                name="revision_activity_status_valid",
            ),
        ]
        indexes = [models.Index(fields=["status", "created_at"])]
