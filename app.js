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
    host: `c237-all.mysql.database.azure.com`,
    port: 3306,
    user: `c237admin`,
    password: `c2372025!`,
    database: `c237_sportstracker`
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

app.get('/addActivity', checkAuthenticated, checkAdmin, (req, res) => {
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

app.get('/updateActivity/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const activityId = req.params.id;
    const sql = 'SELECT * FROM activities WHERE activityId = ?';

    // Fetch data from MySQL based on the activity ID
    connection.query(sql , [activityId], (error, results) => {
        if (error) throw error;

        // Check if any activity with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the activity data
            res.render('updateActivity', { activity: results[0] });
        } else {
            // If no activity with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('Activity not found');
        }
    });
});

app.post('/updateActivity/:id', upload.single('image'), (req, res) => {
    const activityId = req.params.id;
    // Extract activity data from the request body
    const { name, quantity, price } = req.body;
    let image  = req.body.currentVideo; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE activities SET activityName = ? , video =? WHERE activityId = ?';
    // Insert the new activity into the database
    connection.query(sql, [name, video, activityId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating activity:", error);
            res.status(500).send('Error updating activity');
        } else {
            // Send a success response
            res.redirect('/dashboard');
        }
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
    const summary = req.session.summary || [];
    const userId = req.session.user.id;

    const sql = 'SELECT * FROM goal_table WHERE user_id = ?';

    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching goals:', err);
            return res.status(500).send('Error loading profile');
        }

        res.render('profile', {
            user: req.session.user,
            summary,
            goals: results || [] 
        });
    });
});

app.get('/edit-profile', checkAuthenticated, (req, res) => {
    res.render('editProfile', { user: req.session.user });
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

app.get('/plans', (req, res) => {
    const sql = 'SELECT * FROM user u JOIN userplans up ON u.id = up.userid JOIN plans_activity pa ON up.plans_activityid = pa.id JOIN activity a ON a.activityid = pa.activity_id JOIN plans p ON p.plansid = pa.plans_id';
    connection.query(sql, [activityName, video, difficulty], (err, resutlts) => {

    });
app.get('/log-workout', checkAuthenticated, (req, res) => {
    res.render('workout-log', { user: req.session.user });
});

app.post('/log-workout', checkAuthenticated, (req, res) => {
    const { workout_type, duration, calories_burned, intensity } = req.body;
    const workout_date = new Date(); // Get current date

    // Insert workout into the database
    const sql = 'INSERT INTO workouts (user_id, workout_type, duration, calories_burned, intensity, workout_date) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [req.session.user.id, workout_type, duration, calories_burned, intensity, workout_date], (err, result) => {
        if (err) throw err;
        res.redirect('/log-workout');  // Redirect back to log workout page after submission
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

app.get('/plan/:id', (req, res) => {
    res.render('plan');
});

app.get('/browse-plans', (req, res) => {
    res.render('browsePlans');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port https://localhost:${PORT}`))});