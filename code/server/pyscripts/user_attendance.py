import os
import sys
import cv2
import json
import numpy as np
import face_recognition as fr
import pymysql
import uuid

attendance_folder = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "user_images", "attendance")

env_file_loc = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
db_configs = {}

with open (env_file_loc, 'r') as f:
    lines = f.readlines()
    for line in lines:
        content = line.split(" = ")
        if(content[0] == 'DB_USER' or content[0] == 'DB_PASSWORD' or content[0] == 'DB_HOST' or content[0] == 'DB_DATABASE'):
            db_configs[content[0]] = content[1].strip().removeprefix("'").removesuffix("'")

host = db_configs["DB_HOST"]
user = db_configs["DB_USER"]
password = db_configs["DB_PASSWORD"]
database = db_configs["DB_DATABASE"]

mydb = pymysql.connect(host=host, user=user, password=password, database=database)

config_file = os.path.join(os.path.dirname(__file__), "config.json")

with open(config_file, 'r') as f:
    configs = json.load(f)

threshold = configs['threshold']
training_model = configs["model_1"]

images = str(sys.argv[1]).split(",")
fe_file = str(sys.argv[2])

output = {"uploaded": len(images), "detected": 0, "recognized": 0, "recognizedPeople": []}

with open(fe_file, 'r') as f:
    face_emb = json.load(f)[0]

known_faces = list(face_emb.keys())
known_face_encodings = list(face_emb.values())

faces_in_given_images = {}
rec_imgs = []

for image in images:
    given_image = fr.load_image_file(image)
    face_locations = fr.face_locations(given_image, model=training_model)
    face_encodings = fr.face_encodings(given_image, face_locations)

    for face_encoding in face_encodings:
        found_encodings = list(faces_in_given_images.values())
        if faces_in_given_images:
            distances = fr.face_distance(found_encodings, face_encoding)
        if not faces_in_given_images or min(distances) > threshold:
            output["detected"] += 1
            distances = fr.face_distance(known_face_encodings, face_encoding)
            matchIndex = np.argmin(distances)
            if distances[matchIndex] < threshold:
                faces_in_given_images[known_faces[matchIndex]] = face_encoding
                mycursor = mydb.cursor()
                sql = "SELECT name, base_img FROM users WHERE user_id = '"+known_faces[matchIndex]+"'"
                mycursor.execute(sql)
                myresult = mycursor.fetchall()
                if myresult[0][1] not in rec_imgs:
                    output["recognizedPeople"].append({"name": myresult[0][0], "img": myresult[0][1]})
                    rec_imgs.append(myresult[0][1])
                    output["recognized"] += 1
            else:
                faces_in_given_images[uuid.uuid4()] = face_encoding



print(output)
