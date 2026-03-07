<?php
require 'pdo.php';

$message = "";
$messageClass = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $user = $_POST['username'];
    $pass = password_hash($_POST['password'], PASSWORD_BCRYPT);

    try {
        $stmt = $pdo->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
        if ($stmt->execute([$user, $pass])) {
            $message = "Registration successful! You can now login.";
            $messageClass = "adult";
        }
    } catch (PDOException $e) {
        if ($e->getCode() == 23505) {
            $message = "Username already exists.";
        } else {
            $message = "An error occurred. Please try again.";
        }
        $messageClass = "minor";
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
    <title>Register</title>
</head>
<body>
    <div class="card">
        <h2>Create Account</h2>
        
        <?php if ($message): ?>
            <p class="<?= $messageClass; ?>"><?= $message; ?></p>
        <?php endif; ?>

        <form method="POST">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="Username" required>
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Password" required>
            <button type="submit">Register</button>
        </form>
        <div style="margin-top: 15px;">
            <a href="login.php">Back to Login</a>
        </div>
    </div>
    <footer>
        <p><a href="https://www.facebook.com/leomer.benedicto.2024" target="_blank">Facebook</a> - Powered by META AI</p>
    </footer>
</body>
</html>