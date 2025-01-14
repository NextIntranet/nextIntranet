def in_app(request):
    return {
        'in_app': getattr(request, 'in_app', False),
    }
