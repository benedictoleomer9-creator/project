<?php
session_start();
if (!isset($_SESSION['user'])) {
    header("Location: login.php");
    exit();
}
?>
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
    <title>ChatGPT Features</title>
</head>
<body>
    <div class="card">
        <h2>Facebook Page</h2>
        <p>CATCH UP WITH ME ON FACEBOOK AT THE LINK BELOW:</p>
                <p>CONNECT WITH ME ON FACEBOOK!!</p>
                 <p>Click the link below to visit my Facebook page</p>


        <ul style="text-align: left;">
            <li><a href="https://www.facebook.com/leomer.benedicto.2024" target="_blank">LEOMER BENEDICTO is on Facebook</a></li>
        </ul>
        <div style="margin-top: 20px;">
            <a href="dashboard.php">← Back to Dashboard</a>
        </div>
    </div>
    <footer>
        <p><a href="https://www.facebook.com/leomer.benedicto.2024" target="_blank">Facebook</a> Designed by LEOMER BENEDICTO + AI</p>
    </footer>
</body>
</html>