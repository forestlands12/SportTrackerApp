// app.js

const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: `efbmho.h.filess.io`,
    port: 61002,
    user: `sportstrackerc237_lampfolks`,
    password: `2cf8f645b1e21fefa0124eb0c5a58348c773a8e8`,
    database: `sportstrackerc237_lampfolks`,
    name: `sportstrackerc237_lampfolks`,
    waitForConnections: true,
});


connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

// Session Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/activities');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/',  (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            res.redirect('/dashboard');
        } else {
            res.redirect('/activities');
        }
    } else {
        res.render('index', { user: null });
    }
});

app.get('/dashboard', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM activities', (error, results) => {
      if (error) throw error;
      res.render('dashboard', { activities: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});


// --- ADMIN ROUTES ---

// Route to show the list of all activities
app.get('/admin/activities', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = "SELECT * FROM activities ORDER BY activityName ASC";
    pool.query(sql, (error, results) => {
        if (error) {
            console.error("Database error:", error);
            req.flash('error', 'Could not load activities.');
            return res.render('admin/manage-activities', { activities: [] });
        }
        res.render('admin/manage-activities', { activities: results });
    });
});

// Route to show the form for adding a new activity
app.get('/addactivity', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addActivity');
});

// ==== POST SESSION ====

// This route corresponds to the detailed form in 'addActivity.ejs'
app.post('/addactivity', checkAuthenticated, checkAdmin, upload.single('video'), (req, res) => {
    const { 
        activityName, 
        difficulty, 
        rec_sets, 
        rec_reps, 
        rec_duration_mins, 
        progression 
    } = req.body;

    let videoFile = req.file ? req.file.filename : null;

    const sql = `
    INSERT INTO activities 
    (activityName, difficulty, rec_sets, rec_reps, rec_duration_mins, progression, image) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
`;
    const values = [
        activityName,
        difficulty,
        rec_sets || null,
        rec_reps || null,
        rec_duration_mins || null,
        progression,
        videoFile
    ];

    connection.query(sql, values, (error, results) => {
        if (error) {
            console.error("Error adding activity:", error);
            req.flash('error', 'Database error. Could not add activity.');
            return res.redirect('/addactivity');
        }
        req.flash('success', 'New activity has been added to the library!');
        res.redirect('/dashboard');
    });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/activities');
            else
                res.redirect('/dashboard');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/activities', checkAuthenticated, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM activities', (error, results) => {
        if (error) throw error;
        res.render('activities', { user: req.session.user, activities: results });
      });
});

app.post('/track-activity/:id', checkAuthenticated, (req, res) => {
    const activityId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM activities WHERE activityId = ?', [activityId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const activity = results[0];

            // Initialize summary in session if not exists
            if (!req.session.summary) {
                req.session.summary = [];
            }

            // Check if activity already in summary
            const existingItem = req.session.summary.find(item => item.activityId === activityId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.summary.push({
                    activityId: activity.activityId,
                    activityName: activity.activityName,
                    video: activity.video
                });
            }

            res.redirect('/summary');
        } else {
            res.status(404).send("Activity not found");
        }
    });
});

app.get('/summary', checkAuthenticated, (req, res) => {
    const summary = req.session.summary || [];
    res.render('summary', { summary, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/activity/:id', checkAuthenticated, (req, res) => {
  // Extract the activity ID from the request parameters
  const activityId = req.params.id;

  // Fetch data from MySQL based on the activity ID
  connection.query('SELECT * FROM activities WHERE activityId = ?', [activityId], (error, results) => {
      if (error) throw error;

      // Check if any activity with the given ID was found
      if (results.length > 0) {
          // Render HTML page with the activity data
          res.render('activity', { activity: results[0], user: req.session.user  });
      } else {
          // If no activity with the given ID was found, render a 404 page or handle it accordingly
          res.status(404).send('Activity not found');
      }
  });
});

app.get('/addactivity', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addActivity', {user: req.session.user } ); 
});


app.post('/addActivity', upload.single('video'),  (req, res) => {
    // Extract activity data from the request body
    const { name } = req.body;
    let video;
    if (req.file) {
        video = req.file.filename; // Save only the filename
    } else {
        video = null;
    }

    const sql = 'INSERT INTO activity (activityName, video) VALUES (?, ?)';
    // Insert the new activity into the database
    connection.query(sql , [name, video], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding activity:", error);
            res.status(500).send('Error adding activity');
        } else {
            // Send a success response
            res.redirect('/dashboard');
        }
    });
});

app.get('/updateActivity/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const activityId = req.params.id;
    const sql = 'SELECT * FROM activities WHERE activityId = ?';

    connection.query(sql, [activityId], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.status(404).send('Activity not found');

        res.render('updateActivity', { activity: results[0] });
    });
});

// POST Update Activity
app.post('/updateActivity/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const activityId = req.params.id;
    const {
        activityName, difficulty, rec_sets, rec_reps, rec_duration_mins, progression, currentImage
    } = req.body;

    const newImage = req.file ? req.file.filename : currentImage;

    const sql = `
        UPDATE activities SET 
            activityName = ?, 
            difficulty = ?, 
            rec_sets = ?, 
            rec_reps = ?, 
            rec_duration_mins = ?, 
            progression = ?, 
            image = ?
        WHERE activityId = ?
    `;

    const values = [activityName, difficulty, rec_sets || null, rec_reps || null, rec_duration_mins || null, progression, newImage, activityId];

    connection.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error updating activity:', err);
            return res.status(500).send('Update failed');
        }
        res.redirect('/dashboard');
    });
});

app.get('/deleteActivity/:id', (req, res) => {
    const activityId = req.params.id;

    connection.query('DELETE FROM activites WHERE activitiesId = ?', [activityId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting activity:", error);
            res.status(500).send('Error deleting activity');
        } else {
            // Send a success response
            res.redirect('/dashboard');
        }
    });
});

app.get('/profile', checkAuthenticated, (req, res) => {
    const userId = req.session.user?.id;

    const goalQuery = 'SELECT * FROM goals WHERE user_id = ?';
    const summaryQuery = 'SELECT * FROM workout_log WHERE user_id = ?';

    connection.query(goalQuery, [userId], (err, goalResults) => {
        if (err) {
            console.error('Goal query error:', err);
            return res.status(500).send('Database error: goal_table');
        }

        connection.query(summaryQuery, [userId], (err, summaryResults) => {
            if (err) {
                console.error('Summary query error:', err);
                return res.status(500).send('Database error: workout_log');
            }

            res.render('profile', {
                user: req.session.user,
                goals: goalResults,
                summary: summaryResults
            });
        });
    });
});

app.get('/edit-profile', checkAuthenticated, (req, res) => {
    res.render('edit-profile', { user: req.session.user });
});

app.post('/edit-profile', checkAuthenticated, (req, res) => {
    const { email, address, contact } = req.body;
    const userId = req.session.user.id;

    const sql = 'UPDATE users SET email = ?, address = ?, contact = ? WHERE id = ?';
    connection.query(sql, [email, address, contact, userId], (err, result) => {
        if (err) throw err;
        req.session.user.email = email;
        req.session.user.address = address;
        req.session.user.contact = contact;

        res.redirect('/profile');
    });
});

app.post('/profile/upload', checkAuthenticated, upload.single('profilePicture'), (req, res) => {
    const userId = req.session.user.id;
    const profilePicPath = '/images/' + req.file.filename;

    const sql = 'UPDATE users SET profile_picture = ? WHERE id = ?';
    connection.query(sql, [profilePicPath, userId], (err, result) => {
        if (err) {
            console.error('Error saving profile picture:', err);
            return res.status(500).send('Database error');
        }

        req.session.user.profilePicture = profilePicPath;

        res.redirect('/profile');
    });
});

app.get('/goal-log', (req, res) => {
  const goals = []; 
  res.render('goal-log', { goals });
});

app.post('/add-goal', checkAuthenticated,(req, res) => {
  const { description, status } = req.body;
  const userId = req.session.user.id; 

  const sql = 'INSERT INTO goals (user_id, goal, status) VALUES (?, ?, ?)';
  connection.query(sql, [userId, description, status], (err, result) => {
    if (err) {
      console.error(' Database error:', err); 
      return res.send(`Database error: ${err.sqlMessage || err.message}`);
    }

    res.redirect('/goal-log');
  });
});


app.get('/workout-log', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM workout_log WHERE user_id = ?';

    connection.query(sql, [req.session.user.id], (err, results) => {
        if (err) {
            console.error('Error fetching workouts:', err);
            return res.status(500).send('Database error');
        }

        res.render('workout-log', {
            workout_log: results,
            user: req.session.user
        });
    });
});


app.post('/workout-log', checkAuthenticated, (req, res) => {
    const { workout_type, duration, calories_burned, intensity } = req.body;
    const workout_date = new Date();

    const sql = 'INSERT INTO workout_log (user_id, workout_type, duration, calories_burned, intensity, workout_date) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [req.session.user.id, workout_type, duration, calories_burned, intensity, workout_date], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.send(`Database error: ${err.sqlMessage || err.message}`);
        }
        res.redirect('/workout-log');
    });
});

app.post('/workout-log', checkAuthenticated, (req, res) => {
    const { workout_type, duration, calories_burned, intensity } = req.body;
    const workout_date = new Date();

    const sql = `INSERT INTO workout_log (user_id, workout_type, duration, calories_burned, intensity, workout_date) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    connection.query(sql, [
        req.session.user.id,
        workout_type,
        duration,
        calories_burned,
        intensity,
        workout_date
    ], (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).send('Database error');
        }

        res.redirect('/workout-log');
    });
});


// GET route - Display contact page
app.get('/contact', (req, res) => {
    res.render('contact', { user: req.session.user });
});

// POST route - Handle contact form submission
app.post('/contact', (req, res) => {
    const { name, email, subject, message } = req.body;
    
    const sql = 'INSERT INTO contact (name, email, subject, message) VALUES (?, ?, ?, ?)';
    connection.query(sql, [name, email, subject, message], (err, result) => {
        if (err) {
            console.error('Error saving contact:', err);
            res.status(500).send('Error saving contact');
        } else {
            console.log('Contact form submitted and saved:', { name, email, subject });
            req.flash('success', 'Your message has been sent successfully!');
            res.redirect('/contact');
        }
    });
});

app.get('/plans', (req, res) => { //Done by Aloysius
    // Removed p.plan_name from the SELECT statement as it's not available
    const sql = `SELECT p.plansid, p.plansname, p.difficulty, a.activityid, a.activityname
    FROM plans p
    JOIN plans_activities pa ON p.plansid = pa.plansid
    JOIN activities a ON pa.activitiesid = a.activityid
    WHERE p.userid = ?`;
    // Check if user is logged in
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect to login if not authorized
    }
    const userId = req.session.user.id;
    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        const plans = {};
        results.forEach(row => {
            if (!plans[row.plansid]) {
                // Store plan details, using planId as the primary identifier
                plans[row.plansid] = {
                    name: row.plansname, // Store the plan ID
                    difficulty: row.difficulty,
                    activities: []
                };
            };
            // Add activities to the corresponding plan
            plans[row.plansid].activities.push({
                id: row.activityid,
                name: row.activityname
            });
        });
        // Render the browsePlans.ejs template with the structured plans data
        res.render('browsePlans', { plans });
    });
});

app.get('/addPlans', (req, res) => { //Done by Aloysius
    // Ensure user is logged in before accessing this page
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const sqlActivities = `SELECT activityid, activityname, difficulty FROM activities`;
    connection.query(sqlActivities, (err, activities) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error fetching activities');
        }
        res.render('addPlans', { activities });
    });
});

app.post('/addPlans', (req, res) => { //Done by Aloysius
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { planName, difficulty, selectedActivities } = req.body;
    const userId = req.session.user.id;
    if (!planName || !difficulty) {
        return res.status(400).send('Plan name and difficulty are required.');
    }

    const newPlanId = Date.now();

    connection.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).send('Failed to start database transaction.');
        }
        const insertPlanSql = `INSERT INTO plans (plansid, plansname, difficulty, userid) VALUES (?, ?, ?, ?)`;
        connection.query(insertPlanSql, [newPlanId, planName, difficulty, userId], (err, result) => {
            if (err) {
                return connection.rollback(() => {
                    console.error(err);
                    res.status(500).send('Error adding plan to the database.');
                });
            }
            const activitiesToInsert = Array.isArray(selectedActivities) ? selectedActivities : (selectedActivities ? [selectedActivities] : []);

            if (activitiesToInsert.length === 0) {
                return connection.commit(commitErr => {
                    if (commitErr) {
                        console.error(commitErr);
                        return res.status(500).send('Error committing transaction for plan without activities.');
                    }
                    console.log(`Plan "${planName}" (ID: ${newPlanId}) added successfully with no activities.`);
                    res.redirect('/plans'); // Redirect to the plans list page
                });
            }

            const insertPlanActivitiesSql = `INSERT INTO plans_activities (plansid, activitiesid) VALUES ?`;
            const values = activitiesToInsert.map(activityId => [newPlanId, activityId]);

            connection.query(insertPlanActivitiesSql, [values], (err, result) => {
                if (err) {

                    return connection.rollback(() => {
                        console.error(err);
                        res.status(500).send('Error linking activities to the plan.');
                    });
                }

                connection.commit(commitErr => {
                    if (commitErr) {
                        console.error(commitErr);
                        return res.status(500).send('Error committing transaction.');
                    }
                    console.log(`Plan "${planName}" (ID: ${newPlanId}) added successfully with ${activitiesToInsert.length} activities.`);
                    res.redirect('/plans'); // Redirect to the plans list page
                });
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port https://localhost:${PORT}`));