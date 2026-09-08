from django.contrib import admin

from .models import Business, PlatformRole, User


class ReadOnlyAdmin(admin.ModelAdmin):
    actions = None

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return (
            request.user.is_active and not request.user.is_suspended and request.user.is_superuser
        )


@admin.register(User)
class UserAdmin(ReadOnlyAdmin):
    fields = ["id", "mobile", "first_name", "last_name", "is_active", "is_suspended"]
    list_display = ["id", "is_active", "is_suspended"]


@admin.register(Business)
class BusinessAdmin(ReadOnlyAdmin):
    fields = ["id", "name", "kind", "status", "controlled_access"]


admin.site.register(PlatformRole, ReadOnlyAdmin)
