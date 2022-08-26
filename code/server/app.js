// .env configuration
const dotenv = require("dotenv");
dotenv.config();

// Database Connection
const mysql = require("mysql2");
const db = mysql.createConnection({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,  
  database: process.env.DB_DATABASE,
});

// Express Configuration
const express = require("express");
const fileupload = require("express-fileupload");
const cors = require("cors");
const port = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(fileupload());

// Nodemailer Configuration
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, 
    auth: {
      user: process.env.SENDER_GMAIL, 
      pass: process.env.SENDER_APP_PASSWORD, 
    }
});

// Imports for routes and middlwares
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { spawnSync } = require("child_process");

// Folder and File Locations
const frs_jwt_folder = path.join(__dirname, "..", "..");
const fe_folder = path.join(frs_jwt_folder, "code", "face_encodings");
const log_files = path.join(frs_jwt_folder, "log_files");
const user_images = path.join(frs_jwt_folder, "user_images");
const captures_folder = path.join(user_images, "captures");
const deletes_folder = path.join(user_images, "deletes");
const temp_folder = path.join(user_images, "temp");
const uploads_folder = path.join(user_images, "uploads");
const attendance_foder = path.join(user_images, "attendance");
const admin_log = path.join(log_files, "admin_activity_log.txt");
const user_capture_log = path.join(log_files, "user_capture_log.txt");
const user_change_log = path.join(log_files, "user_change_log.txt");

const pyscripts_folder = path.join(frs_jwt_folder, "code", "server", "pyscripts");
const add_user_script = path.join(pyscripts_folder, "add_user.py");
const recognize_user_script = path.join(pyscripts_folder, "recognize_user.py");
const attendance_script = path.join(pyscripts_folder, "user_attendance.py");

// Middlewares
const checkAuth = async (req, res, next) => {
    const { authorization } = req.headers;

    if(!authorization) {
        return res.status(401).json({msg: "No authorization header"});
    }

    const token = authorization.split(" ")[1];

    try {
        const jwt_data = jwt.verify(token, process.env.JWT_SECRET_KEY);
        req.body.username = jwt_data.username;
        next();
    } catch(err) {
        if(err.message === 'jwt expired') {
            return res.status(401).json({message: "Your login is expired. Please login again."});
        } else {
            return res.status(401).json({message: "Invalid Token."});
        }
    }
};

function generateAdminLog() {

}

function generateUserLog() {

}

function generateCaptureLog() {

}

function filterFiller(req_body) {
    var {name, gender, city, department, date_created, username} = req_body;
    if (!name || !name[0]) {
        name = "SELECT name FROM user";
    } else {
        name = "'" + name.join("', '") + "'";
    }
    if (!gender || !gender[0]) {
        gender = "SELECT gender FROM user";
    } else {
        gender = "'" + gender.join("', '") + "'";
    }
    if (!city || !city[0]) {
        city = "SELECT city FROM user";
    } else {
        city = "'" + city.join("', '") + "'";
    }
    if (!department || !department[0]) {
        department = "SELECT department FROM user";
    } else {
        department = "'" + department.join("', '") + "'";
    }
    if (!date_created || !date_created[0]) {
      date_created = "IN (SELECT date_created FROM user)";
    } else if (date_created[1] == "after") {
        date_created = `> '${date_created[0]}'`;
    } else if (date_created[1] == "before") {
        date_created = `< '${date_created[0]}'`;
    } else if (date_created[1] == "at") {
        date_created = `= '${date_created[0]}'`;
    } else {
        date_created = `BETWEEN '${date_created[0]}' AND '${date_created[1]}'`;
    }
    return {name, gender, city, department, date_created, username};
}

// Routes
app.get('/', async (req, res) => {
    res.send(true);
});

app.post('/', async (req, res) => {
    res.send(req.body);
});

app.post("/api/admin/check-username", async (req, res) => {
    const {username} = req.body;

    let regex = /^[a-zA-Z0-9_]{3,20}$/;
    if(!regex.test(username) || username.includes("__") || username.indexOf("_") === 0 || username.indexOf("_") === username.length - 1) {
        return res.status(409).json({message: "Choose a different username."});
    }

    db.query("SELECT username FROM admins WHERE UPPER(username) = UPPER(?)", [username], 
    (err, rows) => {
        if (err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        }
        if (rows.length > 0) {
            return res.status(409).json({message: "Choose a different username"});
        } else {
            return res.status(200).json({message: "Username is available"});
        }
    });
});

app.post("/api/admin/create-account", (req, res) => {
    const {name, username, email, password} = req.body;

    if(!name || !username || !email || !password) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    let regex = /^[a-zA-Z0-9_]{3,20}$/;
    if(!regex.test(username) || username.includes("__") || username.indexOf("_") === 0 || username.indexOf("_") === username.length - 1) {
        return res.status(409).json({message: "Choose a different username."});
    }

    db.query("SELECT email FROM admins WHERE email = ?", [email],
    async (err, rows) => {
        if (err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length > 0) {
            return res.status(409).json({message: "Email already registered. Please Login."});
        } else {
            const token = jwt.sign({email: email}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.REGISTRATION_EXPIRY});
            const link = `http://localhost:${port}/api/admin/activate/${token}`;
            console.log(link);
            try {
                await transporter.sendMail({
                    from: "FRS",
                    to: email,
                    subject: "Activation Link for FRS Account",
                    text: `Greetings ${name},\n\nHere is the activation link for your Facial Recognition System account. The link is valid for ${process.env.REGISTRATION_EXPIRY}.\n\n`+link+"\n\nIf you did not register for the account, please ignore this message.\n\nRegards,\nVedansh Agarwal."
                });
            }
            catch(err) {
                console.log(err);
                return res.status(352).json({message: "Error in sending email."});
            }
            var hashed_password = bcrypt.hashSync(password, 10);
            db.query("INSERT INTO admins (name, username, email, password) VALUES (?, ?, ?, ?)", [name, username, email, hashed_password], 
            (err) => {
                if (err) {
                    console.log(err);
                    return res.status(502).json({message: "Database Error."});
                }
                return res.status(201).json({message: "Account created successfully. Check your email for the activation link."});
            });
        }
    });
});

app.post("/api/admin/generate-activation-link", async (req, res) => {
    const {email} = req.body;

    if(!email) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    db.query("SELECT activation_status FROM admins WHERE email = ?", [email],
    async (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "Account not found."});
        } else if(rows[0].activation_status == 1) {
            return res.status(409).json({message: "Account already activated. Please Login."});
        } else {
            const token = jwt.sign({email: email}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.REGISTRATION_EXPIRY});
            const link = `http://localhost:${port}/api/admin/activate/${token}`;
            console.log(link);
            try {
                await transporter.sendMail({
                    from: "FRS",
                    to: email,
                    subject: "Activation Link for FRS Account",
                    text: `Greetings,\n\nHere is the activation link for your Facial Recognition System account. The link is valid for ${process.env.REGISTRATION_EXPIRY}.\n\n`+link+"\n\nIf you did not register for the account, please ignore this message.\n\nRegards,\nVedansh Agarwal."
                });
            }
            catch(err) {
                console.log(err);
                return res.status(352).json({message: "Error in sending email."});
            }
            return res.status(200).json({message: "Activation link has been sent to your email."});
        }
    });
});

app.get("/api/admin/activate/:token", async (req, res) => {
    const {token} = req.params;

    var email;
    try {
        var jwt_data = jwt.verify(token, process.env.JWT_SECRET_KEY)
        email = jwt_data.email;
    } catch(err) {
        if(err.message === 'jwt expired') {
            return res.status(401).json({message: "Your activation link is expired. Please generate a new one."});
        } else {
            return res.status(401).json({message: "Invalid Token."});
        }
    }

    db.query("SELECT activation_status, username FROM admins WHERE email = ?", [email], 
    (err, rows) => {
        if (err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "Account not found."});
        } else if(rows[0].activation_status == 1) {
            return res.status(409).json({message: "Account already activated. Please Login."});
        } else {
            db.query("UPDATE admins SET activation_status = 1 WHERE email = ?", [email], 
            (err) => {
                if(err) {
                    console.log(err);
                    return res.status(502).json({message: "Database Error."});
                }
                try {
                    fs.writeFileSync(path.join(fe_folder, rows[0].username+".json"), 
                    JSON.stringify([{
                        "no_face":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
                    },[]]));
                } catch (err) {
                    console.log(err);
                    return res.status(502).json({message: "Exception occured. Please contact the site admin."});
                }
                return res.status(200).json({message: "Account activated successfully."});
            });
        }
    })
});

app.post("/api/admin/login", (req, res) => {
    const {username_or_email, password} = req.body;

    if(!username_or_email || !password) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    db.query("SELECT password, activation_status, username FROM admins WHERE (username = ? OR email = ?)", [username_or_email, username_or_email],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "Account not found."});
        } else if(rows[0].activation_status == 0) {
            return res.status(409).json({message: "Account not activated. Please activate your account."});
        } else {
            const password_match = bcrypt.compareSync(password, rows[0].password);
            if(password_match) {
                db.query("INSERT INTO admin_activity_log (activity_by, activity_type) VALUE (?, ?)", [rows[0].username, "Login"],
                (err) => {
                    if(err) {
                        console.log(err);
                        return res.status(502).json({message: "Database Error"});
                    } else {
                        const token = jwt.sign({username: rows[0].username}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.LOGIN_EXPIRY});
                        return res.status(200).json({message: "Login successful.", token: token});
                    }
                });
            } else {
                return res.status(403).json({message: "Invalid credentials."});
            }
        }
    });
});

app.post("/api/admin/generate-password-reset-link", async (req, res) => {
    const {email} = req.body;

    if(!email) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    db.query("SELECT activation_status FROM admins WHERE email = ?", [email],
    async (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "Account not found."});
        } else if(rows[0].activation_status == 0) {
            return res.status(409).json({message: "Account not activated. Please activate your account."});
        } else {
            const token = jwt.sign({email: email}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.RESET_PASSWORD_EXPIRY});
            const link = `http://localhost:${port}/api/admin/reset-password/${token}`;
            console.log(link);
            try {
                await transporter.sendMail({
                    from: "FRS",
                    to: email,
                    subject: "Password Reset Link for FRS Account",
                    text: `Greetings,\n\nHere is the password reset link for your Facial Recognition System account. The link is valid for ${process.env.RESET_PASSWORD_EXPIRY}.\n\n`+link+"\n\nIf you did not generate the password reset request, please ignore this email.\n\nRegards,\nVedansh Agarwal."
                });
            }
            catch(err) {
                console.log(err);
                return res.status(352).json({message: "Error in sending email."});
            }
            return res.status(200).json({message: "Password reset link has been sent to your email."});
        }
    });
});

app.post("/api/admin/reset-password/:token", (req,res) => {
    const {newPassword} = req.body;
    const {token} = req.params;

    if(!newPassword) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    var email;
    try {
        var jwt_data = jwt.verify(token, process.env.JWT_SECRET_KEY)
        email = jwt_data.email;
    } catch(err) {
        if(err.message === 'jwt expired') {
            return res.status(401).json({message: "Your password reset link is expired. Please generate a new one."});
        } else {
            return res.status(401).json({message: "Invalid Token."});
        }
    }

    db.query("SELECT activation_status FROM admins WHERE email = ?", [email],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "Account not found."});
        } else if(rows[0].activation_status == 0) {
            return res.status(409).json({message: "Account not activated. Please activate your account."});
        } else {
            var hashed_password = bcrypt.hashSync(newPassword, 10);
            db.query("UPDATE admins SET password = ? WHERE email = ?", [hashed_password, email],
            (err, rows) => {
                if(err) {
                    console.log(err);
                    return res.status(502).json({message: "Database Error"});
                } else {
                    return res.status(200).json({message: "Password reset successfully."});
                }
            });
        }
    });
});

// app.post("/api/admin/change-username", checkAuth, (req, res) => {
//     const {newUsername, username} = req.body;

// });

app.post("/api/admin/recognize-face", checkAuth, (req, res) => {
    var {base64img, username, user_id} = req.body;
    const {base_img} = req.files;

    if(!base64img && !base_img) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    var extension = ".";
    if (base_img) {
        if(base_img.name.includes(".")) {
            var parts = base_img.name.split(".");
            extension += parts[parts.length - 1];
        } else {
            var parts = base_img.mimetype.split("/");
            extension += parts[parts.length - 1];
        }
    } else {
        extension += base64img.substring(base64img.indexOf("/")+1, base64img.indexOf(";"));
    }
    if (extension !== ".png" && extension !== ".jpeg") {
        // generateAdminLog(username, `Unsupported filetype: ${extension.substring(1)} input by the admin.`);
        return res.status(415).json({ message: "Unsupported filetype" });
    }

    if(!user_id) {
        user_id = uuidv4();
    }

    const imgpath = path.join(temp_folder, user_id + extension);
    const fe_file = path.join(fe_folder, username+".json");

    try {
        if(base_img) {
            fs.writeFileSync(imgpath, base_img.data);
        } else {
            fs.writeFileSync(imgpath, base64img.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        }
    } catch(err) {
        console.log(err);
        return res.status(502).json({message: "Error uploading the image."});
    }

    var python_response = 0;
    const process = spawnSync("python3", [add_user_script, imgpath, fe_file]);
    try {
        python_response = JSON.parse(String(process.stdout).replace(/'/g, '"'));
    } catch (err) {
        console.log(err);
        console.log(String(process.stdout));
        console.log(String(process.stderr));
        return res.status(502).json({message: "Something went wrong with python script."});
    }

    const {errmsg, msg, usr_id, face_encoding} = python_response;

    if(errmsg) {
        // generateAdminLog(username, `Image with ${errmsg} input by the admin`);
        try {
            fs.unlinkSync(imgpath);
        } catch (err) {
            console.log(err);
            return res.status(216).json({message: errmsg+" found"});
        }
        return res.status(216).json({message: errmsg+" found"});
    } else {
        // generateAdminLog(username, `Image with ${msg} user_id: ${usr_id} input by the admin`);
        var statusCode = msg === "existing user" ? 200 : 211;
        return res.status(statusCode).json({message: msg, user_id: usr_id, extension: extension, face_encoding: face_encoding});
    }
});

app.post("/api/admin/users/check-mobile-number", checkAuth, (req, res) => {
    const {mob_no, username} = req.body;
    if(!mob_no) {
        return res.status(403).json({message: "Insufficient data provided."});
    }
    db.query("SELECT mob_no FROM users WHERE (mob_no = ? AND admin = ?)", [mob_no, username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length > 0){
            return res.status(409).send(false);
        } else {
            return res.status(200).send(true);
        }
    });
});

app.post("/api/admin/create-user", checkAuth, (req, res) => {
    const {username, user_id, name, mob_no, gender, city, department, extension, face_encoding} = req.body;

    const fe_file = path.join(fe_folder, username+".json");

    if(!user_id || !name || !mob_no || !gender || !city || !department || !extension || !face_encoding) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    db.query("INSERT INTO users (user_id, base_img, img_ext, name, mob_no, gender, city, department, admin) VALUE (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [user_id, user_id+extension, extension, name, mob_no, gender, city, department, username],
    (err) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else {
            try {
                fs.renameSync(path.join(temp_folder, user_id+extension), path.join(uploads_folder, user_id+extension));
                var fe_data = fs.readFileSync(fe_file);
                fe_data = JSON.parse(fe_data);
                fe_data[0][user_id] = face_encoding;
                fe_data = JSON.stringify(fe_data).replaceAll("],", "],\n").replaceAll("{", "{\n").replaceAll("}", "\n}").replace("},[{", "},\n[{");
                fs.writeFileSync(fe_file, fe_data);
            } catch (err) {
                console.log(err);
                return res.status(502).json({message: "File-System error."});
            }
            // generateAdminLog();
            // generateUserLog();
            return res.status(200).json({message: `User created successfully with User ID: ${user_id}.`});
        }
    });
});

app.patch("/api/admin/update-user/:user_id", checkAuth, (req, res) => {
    const {user_id} = req.params;
    const {username, name, mob_no, gender, city, department, extension, face_encoding} = req.body;
    if(!user_id || !name || !mob_no || !gender || !city || !department) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    const fe_file = path.join(fe_folder, username+".json");

    if(extension) {
        db.query("UPDATE users SET name = ?, mob_no = ?, gender = ?, city = ?, department = ?, base_img = ?, img_ext = ? WHERE (user_id = ? AND admin = ?)",
        [name, mob_no, gender, city, department, user_id+extension, extension, user_id, username],
        (err) => {
            if(err) {
                console.log(err);
                return res.status(502).json({message: "Database Error"});
            } else {
                try {
                    fs.renameSync(path.join(temp_folder, user_id+extension), path.join(uploads_folder, user_id+extension));
                    var fe_data = fs.readFileSync(fe_file);
                    fe_data = JSON.parse(fe_data);
                    fe_data[user_id] = face_encoding;
                    fe_data = JSON.stringify(fe_data).replaceAll("],", "],\n").replaceAll("{", "{\n").replaceAll("}", "\n}").replace("},[{", "},\n[{");
                    fs.writeFileSync(fe_file, fe_data);
                } catch (err) {
                    console.log(err);
                    return res.status(502).json({message: "File-System error."});
                }
                // generateAdminLog();
                // generateUserLog();
                return res.status(200).json({message: `User with User ID: ${user_id} updated successfully.`});
            }
        });
    } else {
        db.query("UPDATE users SET name = ?, mob_no = ?, gender = ?, city = ?, department = ? WHERE (user_id = ? AND admin = ?)",
        [name, mob_no, gender, city, department, user_id, username],
        (err) => {
            if(err) {
                console.log(err);
                return res.status(502).json({message: "Database Error"});
            } else {
                // generateAdminLog();
                // generateUserLog();
                return res.status(200).json({message: `User with User ID: ${user_id} updated successfully.`});
            }
        });
    }
});

app.delete("/api/admin/delete-user/:user_id", checkAuth, (req, res) => {
    const {user_id} = req.params;
    const {username} = req.body;

    const fe_file = path.join(fe_folder, username+".json");

    db.query("CALL delete_user(?, ?)", [user_id, username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else {
            try {
                fs.renameSync(path.join(uploads_folder, rows[0][0].img), path.join(deletes_folder, rows[0][0].img));
                var fe_data = fs.readFileSync(fe_file);
                fe_data = JSON.parse(fe_data);
                delete fe_data[user_id];
                fe_data = JSON.stringify(fe_data).replaceAll("],", "],\n").replaceAll("{", "{\n").replaceAll("}", "\n}");
                fs.writeFileSync(fe_file, fe_data);
            } catch (err) {
                console.log(err);
                return res.status(502).json({message: "File-System error."});
            }
            // generateAdminLog();
            // generateUserLog();
            return res.status(200).json({message: `User with User ID: ${user_id} deleted successfully.`});
        }
    });
});

app.get("/api/admin/get-user/:user_id", checkAuth, (req, res) => {
    const {user_id} = req.params;
    const {username} = req.body;

    db.query("SELECT base_img, name, mob_no, gender, city, department, date_created FROM users WHERE (user_id = ? AND admin = ?)", 
    [user_id, username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "User not found."});
        } else {
            return res.status(200).json(rows[0]);
        }
    });
});

app.get("/api/admin/dashboard", checkAuth, (req, res) => {
    const {username} = req.body;

    db.query("SELECT * FROM users WHERE admin = ? ORDER BY date_created DESC", [username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "No users in the database."});
        } else {
            return res.status(200).json(rows);
        }
    })
});

app.post("/api/admin/get-filtered-users", checkAuth, (req, res) => {
    var {name, gender, city, department, date_created, username} = filterFiller(req.body);
    db.query(`SELECT * FROM users WHERE name IN (${name}) AND gender IN (${gender}) AND city IN (${city}) AND department IN (${department}) AND date_created ${date_created} AND admin = ?`, [username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else if(rows.length == 0) {
            return res.status(404).json({message: "No users match the search criteria."});
        } else {
            return res.status(200).json(rows);
        }
    });
});

app.get("/api/admin/get-admin-log", checkAuth, (req, res) => {
    const {username} = req.body;
    db.query(`CALL get_admin_log(?)`, [username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else {
            return res.status(200).json(rows[0]);
        }
    });
});

app.get("/api/admin/get-capture-log", checkAuth, (req, res) => {
    const {username} = req.body;
    db.query("CALL get_capture_log(?)", [username],
    (err, rows) => {
        if(err) {
            console.log(err);
            return res.status(502).json({message: "Database Error"});
        } else {
            return res.status(200).json(rows[0]);
        }
    });
});

app.post("/api/user/recognize-user", checkAuth, (req, res) => {
    const {username, base64img, in_out_status} = req.body;
    const {image} = req.files;

    if((!base64img && !image) || !in_out_status) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    var extension = ".";
    if (image) {
        if(image.name.includes(".")) {
            var parts = image.name.split(".");
            extension += parts[parts.length - 1];
        } else {
            var parts = image.mimetype.split("/");
            extension += parts[parts.length - 1];
        }
    } else {
        extension += base64img.substring(base64img.indexOf("/")+1, base64img.indexOf(";"));
    }
    if (extension !== ".png" && extension !== ".jpeg") {
        return res.status(415).json({ message: "Unsupported filetype" });
    }

    var image_name = uuidv4() + extension;
    const imgpath = path.join(captures_folder, image_name);
    const fe_file = path.join(fe_folder, username+".json");

    try {
        if(image) {
            fs.writeFileSync(imgpath, image.data);
        } else {
            fs.writeFileSync(imgpath, base64img.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        }
    } catch(err) {
        console.log(err);
        return res.status(502).json({message: "Error uploading the image."});
    }

    var python_response = 0;
    const process = spawnSync("python3", [recognize_user_script, imgpath, fe_file, in_out_status, username]);
    try {
        var pyres = String(process.stdout).split("\n");
        python_response = JSON.parse(pyres[pyres.length-2].replace(/'/g, '"'));
    } catch (err) {
        console.log(err);
        console.log(String(process.stdout).split("\n"));
        console.log(String(process.stderr));
        return res.status(502).json({message: "Something went wrong with python script."});
    }

    if (python_response.errmsg) {
        return res.status(211).json({ message: python_response.errmsg });
    }
    
    python_response.result.forEach((user) => {
        var {user_id, name} = user;
        // generateCaptureLog(user_id, "recognized", name);
    });
    
    if (!python_response.result[0]) {
        // generateCaptureLog(img, "unrecognized");
    }
    
    return res.status(200).json({ users: python_response.result, imgpath: imgpath});
});

app.post("/api/user/attendance-recognition", checkAuth, (req, res) => {
    const {username, images} = req.body;
    const {image_files} = req.files;

    if(!images && !image_files) {
        return res.status(403).json({message: "Insufficient data provided."});
    }

    var image_locations = [];
    const fe_file = path.join(fe_folder, username+".json");

    if(image_files) {
        for(const image of image_files) {
            var extension = ".";
            if(image.name.includes(".")) {
                var parts = image.name.split(".");
                extension += parts[parts.length - 1];
            } else {
                var parts = image.mimetype.split("/");
                extension += parts[parts.length - 1];
            }
            if (extension !== ".png" &&  extension !== ".jpeg") {
                // generateAdminLog(username, "attendance-recognition", "Unsupported filetype");
                return res.status(415).json({ message: "Unsupported filetype" });
            } else {
                const image_name = uuidv4() + extension;
                const image_path = path.join(attendance_foder, image_name);
                try {
                    fs.writeFileSync(image_path, image.data);
                    image_locations.push(image_path);
                } catch(err) {
                    console.log(err);
                    return res.status(502).json({message: "Error uploading the image."});
                }
            }
        }
    } else {
        for(var i = 0; i < images.length; i++) {
            var image = images[i];
            var extension = "." + image.substring(image.indexOf("/")+1, image.indexOf(";"));
            if (extension !== ".png" && extension !== ".jpeg") {
                // generateAdminLog(username, "attendance-recognition", "Unsupported filetype");
                return res.status(415).json({ message: "Unsupported filetype" });
            }
            const image_name = uuidv4() + extension;
            const image_path = path.join(attendance_foder, image_name);
            try {
                fs.writeFileSync(image_path, image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                image_locations.push(image_path);
            } catch(err) {
                console.log(err);
                return res.status(502).json({message: "Error uploading the image."});
            }
        }
    }

    var python_response = 0;
    const process = spawnSync("python3", [attendance_script, image_locations, fe_file]);
    try {
        python_response = JSON.parse(String(process.stdout).replace(/'/g, '"'));
    } catch(err) {
        console.log(err);
        console.log(String(process.stdout));
        console.log(String(process.stderr));
        return res.status(502).json({message: "Something went wrong with python script."});
    }
    res.status(200).json(python_response);
    
    python_response["recognizedNames"] = [];

    python_response["recognizedPeople"].forEach((person) => {
        python_response["recognizedNames"].push(person["name"]);
    });
  
    delete python_response["recognizedPeople"];

    python_response["time of upload"] = new Date().toLocaleString();
    python_response["images"] = image_locations;
    try {
        fe_data = JSON.parse(fs.readFileSync(fe_file));
        fe_data[1].push(python_response);
        fs.writeFileSync(fe_file, JSON.stringify(fe_data).replaceAll("],", "],\n").replaceAll("{", "{\n").replaceAll("}", "\n}").replace("},[{", "},\n[{"));
    } catch(err) {
        console.log(err);
    }
});

// Server Start
app.listen(port, () => console.log(`Server listening on http://localhost:${port}/`));