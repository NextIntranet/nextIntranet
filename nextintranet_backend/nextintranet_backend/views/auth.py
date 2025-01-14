from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages

def login_view(request):
    if request.method == 'POST':
        print(request.POST)
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        print(user)
        if user is not None:
            login(request, user)
            print("Logged in")
            return redirect('home')
        else:
            print("Invalid login")
            messages.error(request, 'Invalid username or password')

    elif request.method == 'GET':
        return render(request, 'auth/login.html')


def logout_view(request):
    logout(request)
    return redirect('login')
