import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "./auth.service";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { InputTextModule } from "primeng/inputtext";
import { PasswordModule } from "primeng/password";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [FormsModule, CommonModule, InputTextModule, PasswordModule, ButtonModule, CardModule],
  templateUrl: "./login.component.html",
})
export class LoginComponent {
  username = "";
  password = "";
  loginError = false;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  onLogin() {
    console.log("Logging in...");
    this.authService.login(this.username, this.password).subscribe(
      (success) => {
        console.log("Is login success?", success);
        if (success) {
          this.router.navigate(["/"]);
        } else {
          this.loginError = true;
        }
      },
      (error) => {
        this.loginError = true;
      },
    );
  }
}
