FROM debian:latest

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update
RUN apt-get install -y python3 python3-pip libpq-dev binutils libproj-dev gdal-bin ghostscript 
#RUN apt-get install -y net-tools

WORKDIR /app
COPY requirements.txt /app/
RUN pip3 install -r requirements.txt --break-system-packages

ENTRYPOINT python3 manage.py runserver 0.0.0.0:8000
