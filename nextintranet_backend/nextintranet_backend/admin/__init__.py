from django.contrib import admin

from ..models.user import User
from ..models.userSettings import UserSetting
from ..models.printList import PrintList, PrintItem

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
    list_display = ('print_list', 'content_type', 'object_id')
    search_fields = ('print_list__name', 'content_type__model', 'object_id')
    list_filter = ('content_type',)

admin.site.register(PrintList, PrintListAdmin)
admin.site.register(PrintItem, PrintItemAdmin)


