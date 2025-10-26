#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <Preferences.h>
#include "time.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- OLED CONFIG ----------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---------------- BUTTONS ----------------
const int scrollButton = 27;
const int startPauseButton = 12;
const int stopButton = 14;

// ---------------- SUBJECTS ----------------
const char* subjects[] = {"Physics", "Chem", "Maths"};
int subjectIndex = 0;

// ---------------- TIMER VARIABLES ----------------
bool timerRunning = false;
unsigned long startTime = 0;
unsigned long elapsedTime = 0;
unsigned long totalTime[3] = {0, 0, 0};

// Display power management
bool displayOn = true;
unsigned long displayTimeout = 5UL * 60UL * 1000UL;  // 5 min
unsigned long lastActivity = 0;

// ---------------- PREFERENCES ----------------
Preferences prefs;

// ---------------- WIFI + NTP ----------------
const char* ssid = "Airtel_Ashu";
const char* password = "28082005";

IPAddress local_IP(192,168,1,51);
IPAddress gateway(192,168,1,1);
IPAddress subnet(255,255,255,0);
IPAddress primaryDNS(8,8,8,8);
IPAddress secondaryDNS(8,8,4,4);

WebServer server(80);

const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 19800;
const int daylightOffset_sec = 0;

// ---------------- BUTTON DEBOUNCE ----------------
const unsigned long debounceDelay = 80;

bool buttonPressed(int pin) {
  static bool lastState[40];
  static unsigned long lastChange[40];
  bool reading = (digitalRead(pin) == LOW);
  unsigned long now = millis();
  if (reading != lastState[pin] && (now - lastChange[pin] > debounceDelay)) {
    lastChange[pin] = now;
    lastState[pin] = reading;
    if (reading) return true;
  }
  return false;
}

// ---------------- HELPER FUNCTIONS ----------------
String formatTime(unsigned long ms) {
  unsigned long sec = ms / 1000;
  unsigned h = sec / 3600;
  unsigned m = (sec % 3600) / 60;
  unsigned s = sec % 60;
  char buf[9];
  sprintf(buf, "%02u:%02u:%02u", h, m, s);
  return String(buf);
}

void drawScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Subject name
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print(subjects[subjectIndex]);

  // Session timer
  display.setTextSize(1);
  display.setCursor(0, 24);
  display.print("Session:");
  display.setTextSize(2);
  display.setCursor(0, 34);
  display.print(formatTime(elapsedTime));

  // Total time
  display.setTextSize(1);
  display.setCursor(0, 58);
  display.print("Total: ");
  display.print(formatTime(totalTime[subjectIndex]));

  display.display();
}

void updateElapsed() {
  elapsedTime = millis() - startTime;
  drawScreen();
}

// ---------------- DATA SAVE/LOAD ----------------
void saveTotals() {
  prefs.begin("study", false);
  prefs.putULong("phy", totalTime[0]);
  prefs.putULong("chem", totalTime[1]);
  prefs.putULong("math", totalTime[2]);
  prefs.end();
}

void loadTotals() {
  prefs.begin("study", false);
  totalTime[0] = prefs.getULong("phy", 0);
  totalTime[1] = prefs.getULong("chem", 0);
  totalTime[2] = prefs.getULong("math", 0);
  prefs.end();
}

// ---------------- DAILY LOG ----------------
void appendDailyLog() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return;

  char datetimeStr[20];
  strftime(datetimeStr, sizeof(datetimeStr), "%Y-%m-%d %H:%M", &timeinfo);

  unsigned long pcm = totalTime[0] + totalTime[1] + totalTime[2];
  File f = SPIFFS.open("/logs.csv", "a");
  if (f) {
    f.printf("%s,%s,%s,%s,%s\n",
             datetimeStr,
             formatTime(totalTime[0]).c_str(),
             formatTime(totalTime[1]).c_str(),
             formatTime(totalTime[2]).c_str(),
             formatTime(pcm).c_str());
    f.close();
  }
  totalTime[0] = totalTime[1] = totalTime[2] = 0;
  saveTotals();
}

// ---------------- SETUP ----------------
void setup() {
#if defined(ARDUINO_XIAO_ESP32C3)
  Wire.begin(4, 5);
#else
  Wire.begin();
#endif

  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    for (;;);
  }
  display.clearDisplay();
  display.display();

  pinMode(scrollButton, INPUT_PULLUP);
  pinMode(startPauseButton, INPUT_PULLUP);
  pinMode(stopButton, INPUT_PULLUP);

  if (!SPIFFS.begin(true)) Serial.println("SPIFFS mount failed");

  if (!SPIFFS.exists("/logs.csv") || SPIFFS.open("/logs.csv", "r").size() == 0) {
    File f = SPIFFS.open("/logs.csv", "w");
    if (f) {
      f.println("Date & Time,Physics,Chemistry,Math,PCM Total");
      f.close();
    }
  }

  loadTotals();

  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS))
    Serial.println("Static IP failed");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to Wi-Fi");

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  drawScreen();
  lastActivity = millis();
}

// ---------------- LOOP ----------------
void loop() {
  // Scroll through subjects
  if (!timerRunning && buttonPressed(scrollButton)) {
    subjectIndex = (subjectIndex + 1) % 3;
    elapsedTime = 0;
    lastActivity = millis();
    drawScreen();
  }

  // Start / Pause button
  if (buttonPressed(startPauseButton)) {
    lastActivity = millis();
    if (!timerRunning) {
      startTime = millis() - elapsedTime;
      timerRunning = true;
    } else {
      elapsedTime = millis() - startTime;
      timerRunning = false;
      totalTime[subjectIndex] += elapsedTime;
      saveTotals();
    }
    drawScreen();
  }

  // Stop button
  if (buttonPressed(stopButton)) {
    lastActivity = millis();
    if (timerRunning) {
      elapsedTime = millis() - startTime;
      timerRunning = false;
    }
    totalTime[subjectIndex] += elapsedTime;
    elapsedTime = 0;
    saveTotals();
    drawScreen();
  }

  // Update OLED while running
  if (timerRunning) updateElapsed();

  // Auto turn off OLED after inactivity
  if (displayOn && !timerRunning && (millis() - lastActivity > displayTimeout)) {
    display.ssd1306_command(SSD1306_DISPLAYOFF);
    displayOn = false;
  }

  // Turn OLED back on if button pressed
  if (!displayOn && (digitalRead(scrollButton) == LOW || digitalRead(startPauseButton) == LOW || digitalRead(stopButton) == LOW)) {
    display.ssd1306_command(SSD1306_DISPLAYON);
    displayOn = true;
    lastActivity = millis();
    drawScreen();
  }

  // Daily log at 2 AM
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    static int lastDay = -1;
    if (timeinfo.tm_hour == 2 && lastDay != timeinfo.tm_mday) {
      appendDailyLog();
      lastDay = timeinfo.tm_mday;
    }
  }

  delay(5);
}
