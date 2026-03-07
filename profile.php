<?php
session_start();
if (!isset($_SESSION['user'])) {
    header("Location: login.php");
    exit();
}

$languages = ["PHP", "JavaScript", "Python", "Java", "C++"];
$profileCreated = false;

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $fullname = htmlspecialchars($_POST['fullname']);
    $age = htmlspecialchars($_POST['age']);
    $course = htmlspecialchars($_POST['course']);
    $favorite = htmlspecialchars($_POST['favorite']);
    $bio = htmlspecialchars($_POST['bio']);
    $profileCreated = true;
}
?>

<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
    <title>Student Profile Generator</title>
</head>
<body>

<div class="card" style="max-width: 500px;">
    <h2>Student Profile Generator</h2>
    <form id="profileForm" method="POST">
        <label>Full Name:</label>
        <input type="text" id="fullname" name="fullname" required>
        
        <label>Age:</label>
        <input type="number" id="age" name="age" required>
        
        <label>Course:</label>
        <input type="text" id="course" name="course" required>
        
        <label>Favorite Programming Language:</label>
        <select id="favorite" name="favorite">
            <?php foreach ($languages as $lang): ?>
                <option value="<?= $lang; ?>"><?= $lang; ?></option>
            <?php endforeach; ?>
        </select>
        
        <label>Short Bio:</label>
        <textarea id="bio" name="bio" required></textarea>
        
        <button type="submit">Generate Profile</button>
    </form>

    <div style="margin-top: 15px;">
        <a href="dashboard.php" style="text-decoration: none; color: #007bff;">← Back to Dashboard</a>
    </div>

    <?php if ($profileCreated): ?>
        <hr style="margin: 20px 0;">
        <div class="profile-card" style="text-align: left;">
            <h3>Generated Profile</h3>
            <p><strong>Name:</strong> <?= $fullname; ?></p>
            <p><strong>Age:</strong> <?= $age; ?></p>
            <p><strong>Course:</strong> <?= $course; ?></p>
            <p><strong>Favorite Language:</strong> <?= $favorite; ?></p>
            <p><strong>Bio:</strong> <?= $bio; ?></p>
            
            <?php
            if ($age < 18) {
                echo "<p class='minor'><strong>Status:</strong> Minor Student</p>";
            } else {
                echo "<p class='adult'><strong>Status:</strong> Adult Student</p>";
            }
            
            if ($favorite == "PHP") {
                echo "<p><strong>Message:</strong> Great! You are ready for OOP in PHP!</p>";
            } else {
                echo "<p><strong>Message:</strong> You will soon learn OOP using PHP!</p>";
            }
            ?>
        </div>
    <?php endif; ?>
</div>

<script>
document.getElementById("profileForm").addEventListener("submit", function(event) {
    const fields = ["fullname", "age", "course", "bio"];
    for(let id of fields) {
        if(document.getElementById(id).value.trim() === "") {
            alert("Please complete all fields.");
            event.preventDefault();
            return;
        }
    }
});
</script>
    <footer>
        <p><a href="https://www.facebook.com" target="_blank">Facebook</a> | <a href="features.php">Features</a> - Powered by META AI</p>
    </footer>
</body>
</html>