# imports
import face_recognition as fr
import numpy as np
import json
import cv2
import os
from datetime import datetime
import time
from tensorflow import keras
import joblib
import pickle
# supress warnings
import tensorflow as tf
tf.get_logger().setLevel('ERROR')
import warnings 
warnings.filterwarnings("ignore")

def detect_faces(img_path_to_img):
    # function to detect faces in given image
    # outputs a list of tuples
    
    # get image
    if type(img_path_to_img) == str:
        img = fr.load_image_file(img_path_to_img)
    else:
        img = img_path_to_img
    
    # get face locations
    face_locations = fr.face_locations(img)
    
    # return face loc
    return face_locations


def detect_liveness_nn(img_path_to_img, face_locations):
    # function to detect liveness of faces
    # outputs a dict with keys=faces and values being face liveness and confidence
    
    # get image
    if type(img_path_to_img) == str:
        img = fr.load_image_file(img_path_to_img)
    else:
        img = img_path_to_img
    # face extraction 
    faces = []
    img_mode = 'BGR'
    for face in face_locations:
        if img_mode == 'RGB':
            faces.append(img[face[0]:face[2], face[3]:face[1]])
        elif img_mode == 'BGR':
            faces.append(img[face[0]:face[2], face[3]:face[1], ::-1]) # invertion
    
    # initialize a dict
    face_liveness = []
    
    # load the liveness detector model
    model_path = os.path.join(os.path.dirname(__file__), 'liveness.model')
    model = keras.models.load_model(model_path)

    # loop over all faces
    for index in range(len(faces)):
        
        faces[index] = cv2.resize(faces[index], (32, 32)) # model requirement
        faces[index] = faces[index].astype("float") / 255.0
        faces[index] = np.expand_dims(faces[index], axis=0)
    
        # pass the face ROI through the trained liveness detector model to determine if the face is "real" or "fake"
        preds = model.predict(faces[index])[0]
        j = np.argmax(preds)
        if j == 0: # spoof
            face_liveness.append({'liveness_status_nn': 'spoof', 'confidence_nn': np.round(preds[j],4)})
        else: # j == 1 implies live
            face_liveness.append({'liveness_status_nn': 'live', 'confidence_nn': np.round(preds[j],4)})
        
    return face_liveness


def calc_hist(img):
    histogram = [0] * 3
    for j in range(3):
        histr = cv2.calcHist([img], [j], None, [256], [0, 256])
        histr *= 255.0 / histr.max()
        histogram[j] = histr
    return np.array(histogram)
    
    
def load_model(att_type):
    
    # attack type specifier - 'print', 'replay'
    
    if att_type == 'print':
        model_name = 'print_attack_model.pkl'
    else:
        model_name = 'replay_attack_model.pkl'
    # load model
    clf = None
    loc = os.path.dirname(__file__)
    
    with open(os.path.join(loc, model_name), 'rb') as file:
        clf = pickle.load(file)
    
    return clf


def detect_liveness_hist(img_path_to_img, face_locations, att_type='replay'):
    # function to detect liveness of faces
    # outputs a dict with keys=faces and values being face liveness and confidence
    
    # get image
    if type(img_path_to_img) == str:
        img = fr.load_image_file(img_path_to_img)
    else:
        img = img_path_to_img
        
    # face extraction 
    faces = []   
    img_mode = 'BGR'
    for ii, face in enumerate(face_locations):
        
        w = face[2] - face[0]
        h = face[1] - face[3]
        mul_fac = 0.1
        inc_w = int(w * mul_fac)
        inc_h = int(h * mul_fac)
        
        #print(w, h, inc_w, inc_h)
        
        if img_mode == 'RGB':
            faces.append(img[face[0]-inc_w:face[2]+inc_w, face[3]-inc_h:face[1]+inc_h])
        elif img_mode == 'BGR':
            faces.append(img[face[0]-inc_w:face[2]+inc_w, face[3]-inc_h:face[1]+inc_h, ::-1]) # invertion
    
    sample_number = 1
    count = 0
    measures = np.zeros(sample_number, dtype=float)
    measures[count%sample_number]=0
    
    # initialize a dict
    face_liveness = []

    # load the liveness detector model
    clf = load_model(att_type)
    
    # loop over all faces
    for index, face in enumerate(faces):
        
        # show face
        show_faces = 0
        if show_faces == 1:
            cv2.imshow('ext img', faces[face])
            cv2.waitKey(0)
            cv2.destroyAllWindows()
    
        
        img_ycrcb = cv2.cvtColor(faces[index], cv2.COLOR_BGR2YCR_CB)
        img_luv = cv2.cvtColor(faces[index], cv2.COLOR_BGR2LUV)
        # calc hist
        ycrcb_hist = calc_hist(img_ycrcb)
        luv_hist = calc_hist(img_luv)

        feature_vector = np.append(ycrcb_hist.ravel(), luv_hist.ravel())
        feature_vector = feature_vector.reshape(1, len(feature_vector))
        # predict prob
        prediction = clf.predict_proba(feature_vector)
        prob = prediction[0][1]

        measures[count % sample_number] = prob

        count+=1
        if att_type == 'print':
            if np.mean(measures) >= 0.5:
                face_liveness.append({'liveness_status_hist': 'spoof', 'confidence_hist': np.round(measures,4)[0]})
            else:
                face_liveness.append({'liveness_status_hist': 'live', 'confidence_hist': np.round(measures,4)[0]})
        else: # attack type == 'replay'
            if np.mean(measures) <= 0.5:
                face_liveness.append({'liveness_status_hist': 'spoof', 'confidence_hist': np.round(measures,4)[0]})
            else:
                face_liveness.append({'liveness_status_hist': 'live', 'confidence_hist': np.round(measures,4)[0]})
        
        
    return face_liveness



def recognize_faces(imgloc, face_locations, face_liveness, face_liveness1, face_emb, mydb, threshold, in_out, admin_name):
    output = {"result":[]}
    already_found_user_ids = []

    given_image = fr.load_image_file(imgloc)
    imgname = imgloc[imgloc.rindex("/")+1:]

    face_encoding = fr.face_encodings(given_image, face_locations)
    if len(face_locations) == 0:
        output['errmsg'] = 'no face'
    else:

        known_faces = list(face_emb.keys())
        known_face_encodings = list(face_emb.values())

        for i in range(len(face_encoding)):

            face_distances = fr.face_distance(known_face_encodings, face_encoding[i])
            best_match = np.argmin(face_distances)
            
            with mydb.cursor() as mycursor:

                if(face_distances[best_match] < threshold):
                    if(known_faces[best_match] not in already_found_user_ids):
                        already_found_user_ids.append(known_faces[best_match])
                        mycursor.execute("CALL record_user_capture(%s, %s, %s, %s)", [imgname, known_faces[best_match], in_out, admin_name])
                        myresult = mycursor.fetchall()
                        output["result"].append({
                            "user_id": known_faces[best_match],
                            "img": myresult[0][1],
                            "name": myresult[0][2],
                            "mob_no": myresult[0][3],
                            "gender": myresult[0][4],
                            "city": myresult[0][5],
                            "department": myresult[0][6],
                            "date_created": myresult[0][7].strftime("%Y-%m-%d %H:%M:%S"),
                            "face_liveness_status_nn": face_liveness[i]["liveness_status_nn"],
                            "face_liveness_confidence_nn": face_liveness[i]["confidence_nn"],
                            "face_liveness_status_hist": face_liveness1[i]["liveness_status_hist"],
                            "face_liveness_confidence_hist": face_liveness1[i]["confidence_hist"]
                        })
                else:
                    mycursor.execute("CALL record_user_capture(%s, %s, %s, %s)", [imgname, "unrecognized", in_out, admin_name])
                    myresult = mycursor.fetchall()

                mydb.commit()

    return output