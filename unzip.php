<?php
/**
 * Remote Unzip Utility for Survey App
 * This script is triggered after FTP upload to extract the package.
 * SECURED: Requires a matching session key to execute.
 */

// SESSION CONFIG (Injected by uploader)
$validToken = '{{DEPLOY_TOKEN}}';

// Configuration
$zipFile = 'deploy.zip';
$extractTo = './';
$logFile = 'deploy_log.txt';

header('Content-Type: application/json');

// 1. Security Check
$providedKey = isset($_GET['key']) ? $_GET['key'] : '';

if (empty($providedKey) || $providedKey !== $validToken) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Unauthorized access. Invalid or missing deployment key."]);
    
    // Immediate self-destruct for security even on unauthorized access
    @unlink($_SERVER['SCRIPT_FILENAME']);
    exit;
}

function appendLog($msg) {
    global $logFile;
    file_put_contents($logFile, "[" . date('Y-m-d H:i:s') . "] " . $msg . "\n", FILE_APPEND);
}

if (!file_exists($zipFile)) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "ZIP file not found."]);
    @unlink($_SERVER['SCRIPT_FILENAME']);
    exit;
}

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "ZipArchive PHP extension is not enabled on this server."]);
    @unlink($_SERVER['SCRIPT_FILENAME']);
    exit;
}

$zip = new ZipArchive;
$res = $zip->open($zipFile);

if ($res === TRUE) {
    // Perform extraction
    $zip->extractTo($extractTo);
    $zip->close();
    
    // Cleanup the zip and THIS script (security measure)
    @unlink($zipFile);
    $self = $_SERVER['SCRIPT_FILENAME'];
    
    appendLog("Successfully deployed latest build.");
    echo json_encode([
        "status" => "success", 
        "message" => "Extraction Successful! Project updated. Script removed.",
        "timestamp" => date('c')
    ]);
    
    // Self-destruct after response
    register_shutdown_function(function() use ($self) {
        @unlink($self);
    });
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to open ZIP (Error code: $res)"]);
    @unlink($_SERVER['SCRIPT_FILENAME']);
}
?>
