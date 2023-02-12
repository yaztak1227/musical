plugins {
    id("java")
    id("org.openjfx.javafxplugin") version("0.0.13")
    id("org.beryx.jlink") version ("2.25.0")
}

group = "com.gmail.circularmoonray"
version = "1.0-SNAPSHOT"

application {
    //Java Module System module name
//    mainModule.set('com.gmail.circularmoonray.javafxgradle')
    //Your JavaFX application class
    mainClass.set("com.gmail.circularmoonray.HelloFX")
}

var javaFXPlatform = getJavaFXPlatformName()
var javaFXVersion = "19"

dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter-api:5.8.1")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.8.1")
    runtimeOnly("org.openjfx:javafx-controls:${javaFXVersion}:${javaFXPlatform}")
}

javafx {
    version = javaFXVersion
    modules = listOf(
            "javafx.controls",
            "javafx.fxml",
    )
}

tasks.getByName<Test>("test") {
    useJUnitPlatform()
}

fun getJavaFXPlatformName():String{
    val currentOS = org.gradle.nativeplatform.platform.internal.DefaultNativePlatform.getCurrentOperatingSystem();
    if (currentOS.isWindows()) {
        return "win"
    } else if (currentOS.isLinux()) {
        return "linux"
    } else if (currentOS.isMacOsX()) {
        return "mac"
    }
    return ""
}
