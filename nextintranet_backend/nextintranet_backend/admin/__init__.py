from django.contrib import admin

from ..models.user import User
from ..models.userSettings import UserSetting
from ..models.printList import PrintList, PrintItem, PrintFile, PrintRenderJob
from ..models.serviceToken import ServiceToken
from ..models.plugin import PluginInstance, PluginInstanceRole

admin.site.site_header = 'NextIntranet Administration'
admin.site.site_title = 'NextIntranet administration panel'
admin.site.index_title = 'Welcome to NextIntranet administration panel'


admin.site.register(User)
admin.site.register(UserSetting)


class PrintItemInline(admin.TabularInline):
    model = PrintItem
    extra = 1

class PrintListAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'is_public', 'printed_at')
    search_fields = ('name', 'owner__username')
    list_filter = ('is_public', 'printed_at')
    inlines = (PrintItemInline,)

class PrintItemAdmin(admin.ModelAdmin):
    list_display = ('print_list', 'content_type', 'object_id', 'kind', 'status', 'created_at')
    search_fields = ('print_list__name', 'content_type__model', 'object_id')
    list_filter = ('content_type', 'kind', 'status')

admin.site.register(PrintList, PrintListAdmin)
admin.site.register(PrintItem, PrintItemAdmin)
admin.site.register(PrintFile)
admin.site.register(PrintRenderJob)
admin.site.register(ServiceToken)


class PluginInstanceRoleInline(admin.TabularInline):
    model = PluginInstanceRole
    extra = 1


class PluginInstanceAdmin(admin.ModelAdmin):
    list_display = ("definition_key", "name", "enabled", "created_at", "created_by")
    list_filter = ("definition_key", "enabled")
    search_fields = ("name", "definition_key")
    inlines = (PluginInstanceRoleInline,)


admin.site.register(PluginInstance, PluginInstanceAdmin)
