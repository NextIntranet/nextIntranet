
import sys

from PyQt6.QtCore import QUrl
from PyQt6.QtWidgets import QApplication, QHBoxLayout, QLineEdit
from PyQt6.QtWidgets import QMainWindow, QPushButton, QVBoxLayout
from PyQt6.QtWidgets import QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWebEngineCore import QWebEngineSettings

from PyQt6.QtCore import pyqtSlot, QObject
from PyQt6.QtCore import QTimer

from PyQt6.QtCore import QThread, pyqtSignal
from PyQt6.QtCore import QSettings, QRect
from PyQt6.QtWidgets import QLabel, QCheckBox, QTableWidget


from PyQt6.QtWidgets import QDialog, QComboBox
from PyQt6.QtWidgets import QVBoxLayout, QHBoxLayout
from PyQt6.QtWidgets import QLabel, QLineEdit, QPushButton
from PyQt6.QtWidgets import QCheckBox
from PyQt6.QtNetwork import QNetworkRequest
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEngineUrlRequestInterceptor
import sys



import time


import webview
import requests

import platform
import cups 
import threading
import serial




class SerialReader(QThread):
    """Třída pro čtení dat ze sériové linky v jiném vlákně"""
    data_received = pyqtSignal(str)  # Signál přenášející zprávu do hlavního vlákna

    def __init__(self, port="/dev/ttyUSB0", baudrate=9600):
        super().__init__()
        self.port = port
        self.baudrate = baudrate
        self.running = True

    def run(self):
        """Hlavní smyčka pro čtení ze sériového portu"""
        try:
            ser = serial.Serial(self.port, self.baudrate, timeout=1)
            while self.running:
                if ser.in_waiting:
                    line = ser.readline().decode("utf-8").strip()
                    print(f"Received from serial: {line}")
                    self.data_received.emit(line)  # Posíláme data do hlavního vlákna
                time.sleep(0.1)
        except serial.SerialException as e:
            print(f"Error opening serial port: {e}")

    def stop(self):
        """Zastaví vlákno"""
        self.running = False
        self.quit()
        self.wait()




class WebBridge(QObject):

    @pyqtSlot(str, str)
    def print_local(self, url, id):

        print("Label printed from Python!")
        print(f"URL: {url}")
        print(f"ID: {id}")

        url = f"http://localhost:8080/store/packet/{id}/print/"
        print(f"Downloading PDF from {url}")
        response = requests.get(url)
        if response.status_code == 200:
            pdf_content = response.content
            print("PDF downloaded successfully")
            if platform.system() == "Linux":
                conn = cups.Connection()
                printers = conn.getPrinters()
                print("Avialible printers: ", list(printers.keys()) )
                printer_name = "TSC_TE310_Network"
                print(f"Printing to {printer_name}")
                with open("/tmp/label.pdf", "wb") as f:
                    f.write(pdf_content)
                
                # Set the size of the PDF
                options = {
                    "media": "Custom.66x38mm",
                }
                conn.printFile(printer_name, "/tmp/label.pdf", f"Label {id}", options)

                print("Printing done")

        else:
            print(f"Failed to download PDF. Status code: {response.status_code}")



class BearerTokenInterceptor(QWebEngineUrlRequestInterceptor):
    def __init__(self, token):
        super().__init__()
        self.token = token

    def interceptRequest(self, info):
        url = info.requestUrl().toString()

        if 'localhost' in url:
            info.setHttpHeader(b"Authorization", f"Bearer {self.token}".encode())



class ConfigWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Configuration")

        # Layouts
        self.layout = QVBoxLayout()
        self.setLayout(self.layout)
        # self.setModal(True)

        # Server URL
        self.url_label = QLabel("Server URL:")
        self.url_input = QLineEdit()
        self.layout.addWidget(self.url_label)
        self.layout.addWidget(self.url_input)

        # Webserver security
        self.security_label = QLabel("Webserver Security:")
        self.security_checkbox = QCheckBox("Enable")
        self.layout.addWidget(self.security_label)
        self.layout.addWidget(self.security_checkbox)

        # Printers
        self.printers_label = QLabel("Printers:")
        self.layout.addWidget(self.printers_label)
        self.printers_table = QTableWidget(0, 4)
        self.printers_table.setHorizontalHeaderLabels(["Name", "Computer Name", "Page Size", "Default"])
        
        self.layout.addWidget(self.printers_table)

        # Readers
        self.readers_label = QLabel("Readers:")
        self.layout.addWidget(self.readers_label)
        self.readers_table = QTableWidget(0, 4)
        self.readers_table.setHorizontalHeaderLabels(["Name", "UART", "Baudrate", "Enabled"])
        self.layout.addWidget(self.readers_table)
        # Add/Edit/Delete buttons for printers
        self.add_printer_button = QPushButton("Add Printer")
        self.edit_printer_button = QPushButton("Edit Printer")
        self.delete_printer_button = QPushButton("Delete Printer")
        self.printer_button_layout = QHBoxLayout()
        self.printer_button_layout.addWidget(self.add_printer_button)
        self.printer_button_layout.addWidget(self.edit_printer_button)
        self.printer_button_layout.addWidget(self.delete_printer_button)
        self.layout.addLayout(self.printer_button_layout)

        # Add/Edit/Delete buttons for readers
        self.add_reader_button = QPushButton("Add Reader")
        self.edit_reader_button = QPushButton("Edit Reader")
        self.delete_reader_button = QPushButton("Delete Reader")
        self.reader_button_layout = QHBoxLayout()
        self.reader_button_layout.addWidget(self.add_reader_button)
        self.reader_button_layout.addWidget(self.edit_reader_button)
        self.reader_button_layout.addWidget(self.delete_reader_button)
        self.layout.addLayout(self.reader_button_layout)

        # Connections for printer buttons
        self.add_printer_button.clicked.connect(self.add_printer)
        self.edit_printer_button.clicked.connect(self.edit_printer)
        self.delete_printer_button.clicked.connect(self.delete_printer)

        # Connections for reader buttons
        self.add_reader_button.clicked.connect(self.add_reader)
        self.edit_reader_button.clicked.connect(self.edit_reader)
        self.delete_reader_button.clicked.connect(self.delete_reader)

        # Buttons
        self.save_button = QPushButton("Save")
        self.cancel_button = QPushButton("Cancel")
        self.button_layout = QHBoxLayout()
        self.button_layout.addWidget(self.save_button)
        self.button_layout.addWidget(self.cancel_button)
        self.layout.addLayout(self.button_layout)

        # Connections
        self.save_button.clicked.connect(self.save_config)
        self.cancel_button.clicked.connect(self.close)

    def save_config(self):
        # Implement saving logic here
        print("Configuration saved")
        settings = QSettings("NextIntranet", "NIA")
        settings.setValue("serverUrl", self.url_input.text())
        settings.setValue("webserverSecurity", self.security_checkbox.isChecked())

        printers = []
        for row in range(self.printers_table.rowCount()):
            printer = {
            "name": self.printers_table.item(row, 0).text(),
            "computerName": self.printers_table.item(row, 1).text(),
            "pageSize": self.printers_table.item(row, 2).text(),
            "default": self.printers_table.item(row, 3).checkState()
            }
            printers.append(printer)
        settings.setValue("printers", printers)

        readers = []
        for row in range(self.readers_table.rowCount()):
            reader = {
            "name": self.readers_table.item(row, 0).text(),
            "uart": self.readers_table.item(row, 1).text(),
            "baudrate": self.readers_table.item(row, 2).text(),
            "enabled": self.readers_table.item(row, 3).checkState()
            }
            readers.append(reader)
        settings.setValue("readers", readers)
        self.close()

    def add_printer(self):
        row_position = self.printers_table.rowCount()
        self.printers_table.insertRow(row_position)

    def edit_printer(self):
        current_row = self.printers_table.currentRow()
        if current_row >= 0:
            # Implement edit logic here
            print(f"Editing printer at row {current_row}")

    def delete_printer(self):
        current_row = self.printers_table.currentRow()
        if current_row >= 0:
            self.printers_table.removeRow(current_row)

    def add_reader(self):
        row_position = self.readers_table.rowCount()
        self.readers_table.insertRow(row_position)

    def edit_reader(self):
        current_row = self.readers_table.currentRow()
        if current_row >= 0:
            # Implement edit logic here
            print(f"Editing reader at row {current_row}")

    def delete_reader(self):
        current_row = self.readers_table.currentRow()
        if current_row >= 0:
            self.readers_table.removeRow(current_row)


class Widgets(QMainWindow, QObject):

    def __init__(self):
        QMainWindow.__init__(self)
        self.setWindowTitle("NIA NextIntranetApp")
        self.widget = QWidget(self)
        self.settings = QSettings("NextIntranet", "NIA")


        # Where the webpage is rendered.
        self.webview = QWebEngineView()
        self.channel = QWebChannel()
        self.bridge = WebBridge()
        self.channel.registerObject("nia", self.bridge)

        self.webview.page().setWebChannel(self.channel)


        # Set custom user agent
        self.webview.page().profile().setHttpUserAgent("NextBrowser")
        self.interceptor = BearerTokenInterceptor(self.settings.value("accessToken"))
        self.webview.page().profile().setUrlRequestInterceptor(self.interceptor)
        self.webview.load(QUrl("http://localhost:8080/"))
        self.webview.urlChanged.connect(self.url_changed)
        

        # Navigation buttons.
        self.back_button = QPushButton("<")
        self.back_button.clicked.connect(self.webview.back)
        self.forward_button = QPushButton(">")
        self.forward_button.clicked.connect(self.webview.forward)
        self.refresh_button = QPushButton("Refresh")
        self.refresh_button.clicked.connect(self.webview.reload)
        self.config_button = QPushButton("Config")
        def show_config():
            self.config_window = ConfigWindow()
            self.config_window.show()
        self.config_button.clicked.connect(show_config)

        # URL address bar.
        self.url_text = QLineEdit()

        # Button to load the current page.
        self.go_button = QPushButton("Go")
        self.go_button.clicked.connect(self.url_set)

        self.toplayout = QHBoxLayout()
        self.toplayout.addWidget(self.back_button)
        self.toplayout.addWidget(self.forward_button)
        self.toplayout.addWidget(self.refresh_button)
        self.toplayout.addWidget(self.url_text)
        self.toplayout.addWidget(self.go_button)
        self.toplayout.addWidget(self.config_button)
        self.toplayout.setContentsMargins(2,2,2,2)
        self.layout = QVBoxLayout()
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.layout.addLayout(self.toplayout)
        self.layout.addWidget(self.webview)

        self.widget.setLayout(self.layout)
        self.setCentralWidget(self.widget)

        QTimer.singleShot(5000, self.call_js_alert)  # Zavolá alert po 5 sekundách

        # Inicializace seriového vlákna
        self.serial_thread = SerialReader(port="/dev/ttyACM0", baudrate=9600)
        self.serial_thread.data_received.connect(self.call_js_alert)
        self.serial_thread.start()

        # Načti pozici a velikost okna z uložených hodnot
        self.load_window_settings()

    def load_window_settings(self):
        """Načte pozici a velikost okna z předchozího spuštění"""
        rect = self.settings.value("windowGeometry", QRect(100, 100, 800, 600))
        self.setGeometry(rect)
        pos = self.settings.value("windowPos", self.pos())
        self.move(pos)

    def closeEvent(self, event):
        """Uloží pozici a velikost okna při zavření aplikace"""
        self.settings.setValue("windowGeometry", self.geometry())
        self.settings.setValue("windowState", self.saveState())
        self.settings.setValue("windowPos", self.pos())
        event.accept()

    def call_js_alert(self):
        print("Calling JS alert")
        self.webview.page().runJavaScript("alert('This is a periodic alert from Python!');")
        #self.timer = threading.Timer(5.0, self.call_js_alert)
        #self.timer.start()

    def url_changed(self, url):
        pass
        """Refresh the address bar"""
        #self.url_text.setText(url.toString())

    def url_set(self):
        """Load the new URL"""
        self.webview.setUrl(QUrl(self.url_text.text()))

class LoginWindow(QDialog):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Login")
        self.settings = QSettings("NextIntranet", "NIA")

        # Layouts
        self.layout = QVBoxLayout()
        self.setLayout(self.layout)

        # Profile selection
        self.profile_label = QLabel("Select Profile:")
        self.profile_select = QComboBox()
        # self.profile_select.addItems(["Profile 1", "Profile 2", "Profile 3"])
        self.layout.addWidget(self.profile_label)
        self.layout.addWidget(self.profile_select)

        # URL address
        self.url_label = QLabel("URL Address:")
        self.url_input = QLineEdit(self.settings.value("serverUrl", "http://localhost:8080"))
        self.layout.addWidget(self.url_label)
        self.layout.addWidget(self.url_input)

        # Username
        self.username_label = QLabel("Username:")
        self.username_input = QLineEdit(self.settings.value("username", ""))
        self.layout.addWidget(self.username_label)
        self.layout.addWidget(self.username_input)

        # Password
        self.password_label = QLabel("Password:")
        self.password_input = QLineEdit(self.settings.value("password", ""))
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.layout.addWidget(self.password_label)
        self.layout.addWidget(self.password_input)

        # Save password checkbox
        self.save_password_checkbox = QCheckBox("Save Password")
        self.layout.addWidget(self.save_password_checkbox)

        # Login button
        self.login_button = QPushButton("Login")
        self.login_button.clicked.connect(self.login)
        self.layout.addWidget(self.login_button)

        # Center the window on the screen
        screen_geometry = QApplication.primaryScreen().geometry()
        x = (screen_geometry.width() - self.width()) // 2
        y = (screen_geometry.height() - self.height()) // 2
        self.move(x, y)


    def login(self):
        
        url = self.url_input.text()
        username = self.username_input.text()
        password = self.password_input.text()
        save_password = self.save_password_checkbox.isChecked()

        self.settings.setValue("serverUrl", url)
        self.settings.setValue("username", username)
        if save_password:
            self.settings.setValue("password", password)

        # Call API to get token
        request_url = f"http://localhost:8080/api/token/"
        response = requests.post(request_url, data={"username": username, "password": password})
        if response.status_code == 200:
            token = response.json().get("access")
            token_refresh = response.json().get("refresh")
            
            # Save token to cache
            self.settings.setValue("accessToken", token)
            self.settings.setValue("refreshToken", token_refresh)
            
            print(f"Login successful, token: {token}")
            self.accept()
            
        else:
            print("Login failed")
            print(response.status_code)
            print(response.json())
        
        self.settings.sync()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    login_window = LoginWindow()
    if login_window.exec() == QDialog.DialogCode.Accepted:
        window = Widgets()
        window.show()
        try:
            sys.exit(app.exec())
        except AttributeError:
            sys.exit(app.exec())

# if __name__ == "__main__":
#     app = QApplication(sys.argv)
#     window = Widgets()
#     window.show()
#     try:
#         sys.exit(app.exec_())
#     except AttributeError:
#         sys.exit(app.exec())
