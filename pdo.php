
<?php
try {
    $pdo = new PDO("pgsql:host=localhost;dbname=db_oop", "postgres", "leomer");
    $pdo->exec("SET search_path TO db_oop");
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>