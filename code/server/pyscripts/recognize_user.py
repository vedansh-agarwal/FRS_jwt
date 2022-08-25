import os
import sys
import json
import pymysql
import liveness_scripts.fr_helper_02 as fr_helper

imgloc = str(sys.argv[1])
fe_file = str(sys.argv[2])
in_out = str(sys.argv[3])
admin_name = str(sys.argv[4])

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

face_locations = fr_helper.detect_faces(imgloc)
face_liveness = fr_helper.detect_liveness_nn(imgloc, face_locations)
face_liveness1 = fr_helper.detect_liveness_hist(imgloc, face_locations)

with open(fe_file, 'r') as f:
    face_emb = json.load(f)[0]

output = fr_helper.recognize_faces(imgloc, face_locations, face_liveness, face_liveness1, face_emb, mydb, threshold, in_out, admin_name)

print(output)