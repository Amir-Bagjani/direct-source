from django.utils import timezone
from rest_framework import serializers

from .models import Address, Business, User, VerificationSection, normalize_mobile


class MobileField(serializers.CharField):
    def to_internal_value(self, data):
        return normalize_mobile(super().to_internal_value(data))


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "mobile", "first_name", "last_name", "email", "email_verified_at"]
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    mobile = MobileField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    accept_terms = serializers.BooleanField()


class LoginSerializer(serializers.Serializer):
    mobile = MobileField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField(max_length=4096)


class LogoutSerializer(serializers.Serializer):
    all_sessions = serializers.BooleanField(default=False)


class EmailRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EmailChangeSerializer(serializers.Serializer):
    email = serializers.EmailField(allow_blank=True)
    current_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class EmailTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class ResetSerializer(EmailTokenSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class AddressInputSerializer(serializers.Serializer):
    province = serializers.CharField(max_length=100)
    city = serializers.CharField(max_length=100)
    address = serializers.CharField(max_length=1000)


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "province", "city", "address"]
        read_only_fields = fields


class BusinessInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    kind = serializers.ChoiceField(choices=Business.Kind.choices)
    phone = serializers.RegexField(r"^\+?[0-9]{7,15}$")
    description = serializers.CharField(max_length=2000)
    address = AddressInputSerializer()


class BusinessDraftSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    phone = serializers.RegexField(r"^\+?[0-9]{7,15}$")
    description = serializers.CharField(max_length=2000)
    address = AddressInputSerializer()
    logo = serializers.UUIDField(allow_null=True)


class BusinessSerializer(serializers.ModelSerializer):
    addresses = AddressSerializer(many=True, read_only=True)

    class Meta:
        model = Business
        fields = [
            "id",
            "name",
            "kind",
            "status",
            "phone",
            "description",
            "logo",
            "controlled_access",
            "first_verified_at",
            "addresses",
        ]
        read_only_fields = fields


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationSection
        fields = ["kind", "status", "data", "reason"]
        read_only_fields = fields


class IdentitySerializer(serializers.Serializer):
    national_id = serializers.RegexField(r"^[0-9]{10}$")
    birth_date = serializers.DateField()
    card_front = serializers.UUIDField()
    card_back = serializers.UUIDField()
    selfie = serializers.UUIDField()

    def validate_birth_date(self, value):
        if value >= timezone.now().date():
            raise serializers.ValidationError("تاریخ تولد معتبر نیست.")
        return value


class ActivitySerializer(serializers.Serializer):
    evidence_type = serializers.ChoiceField(choices=["license", "alternative"])
    files = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000)


class ReviewSerializer(ReasonSerializer):
    kind = serializers.ChoiceField(choices=[("identity", "هویت"), ("activity", "فعالیت")])
    decision = serializers.ChoiceField(choices=["approved", "changes_requested", "rejected"])


class ControlledAccessSerializer(ReasonSerializer):
    enabled = serializers.BooleanField()
