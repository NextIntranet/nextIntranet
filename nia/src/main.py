import webview
import requests

import platform
import cups 
import threading
import serial


if __name__ == '__main__':
    # Create a standard webview window

    print(webview.settings)
    webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False
    webview.settings['REMOTE_DEBUGGING_PORT'] = 9222



    def read_serial():
        ser = serial.Serial('/dev/ttyACM0', 9600, timeout=0.2)
        while True:
            line = ser.readline().decode('utf-8').strip()
            if line:
                print(f"Serial data received: {line}")
                # Handle the serial data here
                window.evaluate_js(f"console.log('Serial data received: {line}')")
                #window.evaluate_js(f"handleSerialData('{line}')")


    serial_thread = threading.Thread(target=read_serial)
    serial_thread.daemon = True
    serial_thread.start()    

    def call_js_function(data):
        window.evaluate_js(f"handleSerialData('{data}')")



    def print_label(url, id):
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
                printer_name = list(printers.keys())[0]
                printer_name = "TSC_TE310_Network"
                print(f"Printing to {printer_name}")
                with open("/tmp/label.pdf", "wb") as f:
                    f.write(pdf_content)
                
                # Set the size of the PDF
                options = {
                    "media": "Custom.66x38mm",
                }
                conn.printFile(printer_name, "/tmp/label.pdf", f"Label {id}", options)

        else:
            print(f"Failed to download PDF. Status code: {response.status_code}")


    def create_js_api():
        class Api:
            def print_label(self, url, id):
                print_label(url, id)
        return Api()

    def custom_logic(window):
        print("Custom logic executed")
        window.evaluate_js("console.log('Hello from Python!')")

    window = webview.create_window('Simple browser', 'http://localhost:8080/', js_api=create_js_api())
    webview.start(custom_logic, user_agent="NextBrowser", debug=True)