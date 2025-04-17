export function always_log(message: string, data?: any) {
    if (data) {
        console.error(message + ": " + JSON.stringify(data));
    } else {
        console.error(message);
    }
}

