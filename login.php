<?php
session_start();
require 'pdo.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $user = $_POST['username'];
    $pass = $_POST['password'];

    // Fixed: Using $stmt to prepare and execute the query
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$user]);
    $userData = $stmt->fetch();

    if ($userData && password_verify($pass, $userData['password'])) {
        $_SESSION['user'] = $userData['username'];
        header("Location: dashboard.php");
        exit();
    } else {
        $error = "Invalid username or password.";
    }
}
?>
<!DOCTYPE html>
<html>
<head><link rel="stylesheet" href="style.css"></head>
<body>
    <div class="card">
        <h2>Login</h2>
        <?php if (isset($error)) echo "<p style='color:red'>$error</p>"; ?>
        <form method="POST">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="Username" required>
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Password" required>
            <button type="submit">Enter</button>
        </form>
        <p>New here? <a href="register.php">Register</a></p>
    </div>
    <footer>
        <p><a href="https://www.facebook.com/leomer.benedicto.2024" target="_blank">Facebook</a> - Powered by META AI</p>
    </footer>
</body>
</html>