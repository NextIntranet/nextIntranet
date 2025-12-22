from pymongo import bson
import os


import bson
with open('/home/roman/Dokumenty/mongodump_20241227/USTintranet/store_positions.bson','rb') as f:
    data = bson.decode_all(f.read())


# def read_bson_file(file_path):
#     try:
#         documents = []
#         with open(file_path, 'rb') as f:
            

# def process_directory(directory_path):
#     for filename in os.listdir(directory_path):
#         if filename.endswith('.bson'):
#             read_bson_file(os.path.join(directory_path, filename))
    


#process_directory('/home/roman/Dokumenty/mongodump_20241227/USTintranet')

read_bson_file('/home/roman/Dokumenty/mongodump_20241227/USTintranet/store_positions.bson')