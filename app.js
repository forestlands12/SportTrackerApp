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
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
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
    res.render('index', {user: req.session.user} );
});

app.get('/dashboard', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM products', (error, results) => {
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
    connection.query('SELECT * FROM products', (error, results) => {
        if (error) throw error;
        res.render('activities', { user: req.session.user, activities: results });
      });
});

app.post('/track-activity/:id', checkAuthenticated, (req, res) => {
    const activityId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM products WHERE productId = ?', [activityId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const activity = results[0];

            // Initialize summary in session if not exists
            if (!req.session.summary) {
                req.session.summary = [];
            }

            // Check if activity already in summary
            const existingItem = req.session.summary.find(item => item.productId === activityId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.summary.push({
                    productId: activity.productId,
                    productName: activity.productName,
                    price: activity.price,
                    quantity: quantity,
                    image: activity.image
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
  connection.query('SELECT * FROM products WHERE productId = ?', [activityId], (error, results) => {
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

app.post('/addActivity', upload.single('image'),  (req, res) => {
    // Extract activity data from the request body
    const { name, quantity, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    // Insert the new activity into the database
    connection.query(sql , [name, quantity, price, image], (error, results) => {
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
    const sql = 'SELECT * FROM products WHERE productId = ?';

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
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE products SET productName = ? , quantity = ?, price = ?, image =? WHERE productId = ?';
    // Insert the new activity into the database
    connection.query(sql, [name, quantity, price, image, activityId], (error, results) => {
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

    connection.query('DELETE FROM products WHERE productId = ?', [activityId], (error, results) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));