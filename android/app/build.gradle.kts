import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

fun signingValue(envName: String, propName: String, fallback: String = ""): String {
    val fromEnv = System.getenv(envName)?.trim().orEmpty()
    if (fromEnv.isNotEmpty()) return fromEnv
    val fromFile = keystoreProperties.getProperty(propName)?.trim().orEmpty()
    if (fromFile.isNotEmpty()) return fromFile
    return fallback
}

android {
    namespace = "uk.co.absmotsauto.admin"
    compileSdk = 34

    defaultConfig {
        applicationId = "uk.co.absmotsauto.admin"
        minSdk = 24
        targetSdk = 34
        versionCode = 140
        versionName = "1.4.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../keystore/abs-mots.p12")
            storePassword = signingValue("ABS_KEYSTORE_PASSWORD", "storePassword")
            keyAlias = signingValue("ABS_KEY_ALIAS", "keyAlias", "absmots")
            keyPassword = signingValue("ABS_KEY_PASSWORD", "keyPassword")
            storeType = "PKCS12"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.material:material:1.12.0")
}
