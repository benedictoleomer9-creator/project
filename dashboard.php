<?php
session_start();
if (!isset($_SESSION['user'])) { header("Location: login.php"); exit(); }
?>
<!DOCTYPE html>
<html>
<head><link rel="stylesheet" href="style.css"></head>
<body>
    <div class="card">
        <h2>Welcome, <?= htmlspecialchars($_SESSION['user']); ?>!</h2>
        <p>Acces confirmed. Your portal is now active.</p>
        <hr>
        <div style="margin-top: 20px;">
            <a href="profile.php">View Profile</a> | <a href="logout.php">Logout</a>
        </div>
    </div>
    <footer>
        <p><a href="https://www.facebook.com/leomer.benedicto.2024" target="_blank">Facebook</a> - designed by: LEOMER BENEDICTO + AI</p>
    </footer>
</body>
</html>