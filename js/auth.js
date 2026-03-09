class AuthManager {
    constructor() {
        this.usersKey = 'cloudUsers';
        this.currentUserKey = 'currentUser';
        this.users = this.loadUsers();
        this.currentUser = this.loadCurrentUser();
    }

    loadUsers() {
        const users = localStorage.getItem(this.usersKey);
        return users ? JSON.parse(users) : [];
    }

    loadCurrentUser() {
        const user = localStorage.getItem(this.currentUserKey);
        return user ? JSON.parse(user) : null;
    }

    saveUsers() {
        localStorage.setItem(this.usersKey, JSON.stringify(this.users));
    }

    saveCurrentUser(user) {
        this.currentUser = user;
        localStorage.setItem(this.currentUserKey, JSON.stringify(user));
    }

    register(username, pin) {
        // Check if user exists
        if (this.users.find(u => u.username === username)) {
            return { success: false, message: 'Username already exists' };
        }

        const user = {
            id: 'user_' + Date.now(),
            username: username,
            pin: pin, // In production, you should hash this
            createdAt: new Date().toISOString()
        };

        this.users.push(user);
        this.saveUsers();
        this.saveCurrentUser(user);
        
        return { success: true, message: 'Registration successful' };
    }

    login(username, pin) {
        const user = this.users.find(u => u.username === username && u.pin === pin);
        
        if (user) {
            this.saveCurrentUser(user);
            return { success: true, message: 'Login successful' };
        }
        
        return { success: false, message: 'Invalid username or PIN' };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem(this.currentUserKey);
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}